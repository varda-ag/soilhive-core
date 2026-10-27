import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v7 as uuidv7 } from 'uuid';
import { Job } from 'pg-boss';
import FileEntity from '../../../src/entities/File';
import DatasetFileMappingEntity from '../../../src/entities/DatasetFileMapping';
import RasterFilterEntity from '../../../src/entities/RasterFilter';
import { RasterFilterInstallJob } from '../../../src/interfaces/Job';
import { processRasterFilterInstall, stagingTableName } from '../../../src/jobs/raster-filter-install/RasterFilterInstaller';
import * as PgBossModule from '../../../src/services/PgBoss';
import FileService from '../../../src/services/FileService';
import { addDataMapping, addDataset, addDatasetFileMapping } from '../../../src/utils/mock';
import { JobQueues } from '../../../src/types/enums';
import { getDataSource } from '../../../src/utils/data-source';
import { rasterFilterTables } from '../../../src/utils/raster';
import { workerOutputDir } from '../../assets';

const FILTER_ID = 'test_installed_filter';

// HWSD soil groups: UInt32, nodata 0, 30 arc-second pixels. It declares no CRS, so the tests assign EPSG:4326.
const HWSD_SAMPLE = path.join(__dirname, '../../assets/soil_groups/spatial_filter_hwsd_256_sample.tif');

let sourceDir: string;

/** A variant of the HWSD sample, kept small so each install takes seconds. */
const makeRaster = (name: string, args: string[], tool: 'gdal_translate' | 'gdalwarp' = 'gdal_translate'): string => {
  const output = path.join(sourceDir, name);
  fs.rmSync(output, { force: true });
  execFileSync(tool, ['-q', ...args, path.join(sourceDir, 'small.tif'), output]);
  return output;
};

/** Stores `rasterPath` the way POST /files would, and creates the Raster Filter that installs from it. */
const addFilterWithSource = async (rasterPath: string): Promise<FileEntity> => {
  const storageRoot = process.env.LOCAL_STORAGE_ROOT_FOLDER!;
  const key = path.join('raster-filters', `${uuidv7()}-${path.basename(rasterPath)}`);
  fs.mkdirSync(path.dirname(path.join(storageRoot, key)), { recursive: true });
  fs.copyFileSync(rasterPath, path.join(storageRoot, key));
  const dataSource = await getDataSource();
  const file = await dataSource
    .getRepository(FileEntity)
    .save(dataSource.getRepository(FileEntity).create({ name: path.basename(rasterPath), file_path: key, created_by: 'tests' }));
  await dataSource.getRepository(RasterFilterEntity).save({ id: FILTER_ID, name: 'Installed', description: '', file_id: file.id });
  return file;
};

const getJob = (band = 1): Job<RasterFilterInstallJob> =>
  ({
    id: uuidv7(),
    name: JobQueues.RASTER_FILTER_INSTALL,
    data: {
      type: JobQueues.RASTER_FILTER_INSTALL,
      created_by: 'test-user',
      raster_filter_id: FILTER_ID,
      band,
      isDataAdmin: true,
      isSuperAdmin: false,
    },
  }) as Job<RasterFilterInstallJob>;

const relationsLike = async (pattern: string): Promise<string[]> => {
  const rows: { relname: string }[] = await (
    await getDataSource()
  ).query(
    `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND relkind = 'r' AND relname LIKE $1`,
    [pattern],
  );
  return rows.map(row => row.relname).sort();
};

describe('processRasterFilterInstall', () => {
  beforeAll(() => {
    sourceDir = workerOutputDir('raster-filter-install');
    execFileSync('gdal_translate', [
      '-q',
      '-a_srs',
      'EPSG:4326',
      '-outsize',
      '10%',
      '10%',
      '-r',
      'nearest',
      HWSD_SAMPLE,
      path.join(sourceDir, 'small.tif'),
    ]);
  });

  beforeEach(() => {
    jest.spyOn(PgBossModule, 'progressReporter').mockReturnValue(async () => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const dataSource = await getDataSource();
    for (const table of [...rasterFilterTables(FILTER_ID), ...(await relationsLike('%\\_rfi\\_%'))]) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  });

  it('installs one band in EPSG:4326, with its overviews, values and resolution, and deletes the File', async () => {
    const file = await addFilterWithSource(path.join(sourceDir, 'small.tif'));
    const job = getJob();
    await processRasterFilterInstall(job);

    expect(await relationsLike(`%${FILTER_ID}`)).toEqual([...rasterFilterTables(FILTER_ID)].sort());
    expect(await relationsLike(`%${stagingTableName(job.id)}`)).toEqual([]);

    const dataSource = await getDataSource();
    const [{ srid }] = await dataSource.query(`SELECT ST_SRID(rast) AS srid FROM "${FILTER_ID}" LIMIT 1`);
    expect(srid).toBe(4326);

    const filter = await dataSource.getRepository(RasterFilterEntity).findOneByOrFail({ id: FILTER_ID });
    expect(filter.file_id).toBeNull();
    expect(filter.active).toBe(false);
    expect(filter.mappings).toBeNull();
    // Ten times the sample's 30 arc-second pixels
    expect(filter.resolution_m).toBe(9277);
    const values = Object.keys(filter.pixel_values!);
    expect(values.length).toBeGreaterThan(0);
    // Soil groups are WRB codes; nodata (0) is not counted
    expect(values.every(value => /^[1-9]\d*$/.test(value))).toBe(true);

    expect(await dataSource.getRepository(FileEntity).findOneBy({ id: file.id })).toBeNull();
    expect(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT_FOLDER!, file.file_path))).toBe(false);
  });

  it('reprojects a projected raster, filling outside its footprint with its nodata', async () => {
    const projected = makeRaster('projected.tif', ['-t_srs', 'EPSG:3857'], 'gdalwarp');
    await addFilterWithSource(projected);
    await processRasterFilterInstall(getJob());

    const dataSource = await getDataSource();
    const [{ srid }] = await dataSource.query(`SELECT ST_SRID(rast) AS srid FROM "${FILTER_ID}" LIMIT 1`);
    expect(srid).toBe(4326);
    const filter = await dataSource.getRepository(RasterFilterEntity).findOneByOrFail({ id: FILTER_ID });
    expect(filter.pixel_values).not.toHaveProperty('0');
  });

  it.each<[string, () => string, number, string]>([
    ['a floating-point band', () => makeRaster('float.tif', ['-ot', 'Float32']), 1, 'RFI_CONTINUOUS_NOT_SUPPORTED'],
    ['a band the file does not have', () => path.join(sourceDir, 'small.tif'), 2, 'RFI_INVALID_BAND'],
    [
      'a projected band without nodata',
      () => {
        makeRaster('projected_nodata.tif', ['-t_srs', 'EPSG:3857'], 'gdalwarp');
        const output = path.join(sourceDir, 'projected_no_nodata.tif');
        fs.rmSync(output, { force: true });
        execFileSync('gdal_translate', ['-q', '-a_nodata', 'none', path.join(sourceDir, 'projected_nodata.tif'), output]);
        return output;
      },
      1,
      'RFI_NODATA_REQUIRED',
    ],
    ['a band of nodata only', () => makeRaster('empty.tif', ['-scale', '0', '1', '0', '0']), 1, 'RFI_NO_VALID_PIXELS'],
  ])('fails on %s, leaving nothing behind', async (_, source, band, code) => {
    const file = await addFilterWithSource(source());
    const job = getJob(band);
    await expect(processRasterFilterInstall(job)).rejects.toMatchObject({ code });

    expect(await relationsLike(`%${FILTER_ID}`)).toEqual([]);
    expect(await relationsLike(`%${stagingTableName(job.id)}`)).toEqual([]);
    // Kept for a retry
    expect(await (await getDataSource()).getRepository(FileEntity).findOneBy({ id: file.id })).not.toBeNull();
  });

  it('fails on a raster with no CRS', async () => {
    await addFilterWithSource(HWSD_SAMPLE);
    await expect(processRasterFilterInstall(getJob())).rejects.toMatchObject({ code: 'RFI_NOT_GEOREFERENCED' });
  });

  it('fails when one of its table names was taken while it ran', async () => {
    await addFilterWithSource(path.join(sourceDir, 'small.tif'));
    const dataSource = await getDataSource();
    await dataSource.query(`CREATE TABLE "o_16_${FILTER_ID}" (id int)`);
    const job = getJob();
    await expect(processRasterFilterInstall(job)).rejects.toMatchObject({ code: 'RFI_NAME_TAKEN', params: { table: `o_16_${FILTER_ID}` } });
    expect(await relationsLike(`%${stagingTableName(job.id)}`)).toEqual([]);
    expect(await relationsLike(FILTER_ID)).toEqual([]);
  });

  it('keeps the File when a dataset took it while the install was queued', async () => {
    const file = await addFilterWithSource(path.join(sourceDir, 'small.tif'));
    const dataset = await addDataset('dataset-taking-the-file', [0, 0, 1, 1]);
    const mapping = await addDatasetFileMapping(dataset.id, (await addDataMapping({})).id);
    const dataSource = await getDataSource();
    // Set up directly: DatasetFileMappingService refuses the source of a raster filter
    await dataSource.getRepository(DatasetFileMappingEntity).update({ id: mapping.id }, { file_id: file.id });
    await processRasterFilterInstall(getJob());

    expect(await relationsLike(`%${FILTER_ID}`)).toEqual([...rasterFilterTables(FILTER_ID)].sort());
    expect(await dataSource.getRepository(FileEntity).findOneBy({ id: file.id })).not.toBeNull();
    expect(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT_FOLDER!, file.file_path))).toBe(true);
  });

  it('keeps the File row for orphan cleanup when its bytes cannot be deleted', async () => {
    const file = await addFilterWithSource(path.join(sourceDir, 'small.tif'));
    jest
      .spyOn(FileService, 'getStorageEngine')
      .mockReturnValue({ deleteFile: () => Promise.reject(new Error('storage unavailable')) } as any);
    await processRasterFilterInstall(getJob());

    const dataSource = await getDataSource();
    expect((await dataSource.getRepository(RasterFilterEntity).findOneByOrFail({ id: FILTER_ID })).file_id).toBeNull();
    expect(await dataSource.getRepository(FileEntity).findOneBy({ id: file.id })).not.toBeNull();
  });

  it('fails when the raster filter was deleted before it ran', async () => {
    await expect(processRasterFilterInstall(getJob())).rejects.toMatchObject({ code: 'RFI_FILTER_NOT_FOUND' });
  });
});
