import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fromFile } from 'geotiff';
import { Job } from 'pg-boss';
import DatasetEntity from '../../../src/entities/Dataset';
import DatasetFileMappingEntity from '../../../src/entities/DatasetFileMapping';
import FileEntity from '../../../src/entities/File';
import RasterLayerEntity from '../../../src/entities/RasterLayer';
import RasterLayerAssetEntity from '../../../src/entities/RasterLayerAsset';
import { RasterLoadJob } from '../../../src/interfaces/Job';
import { RasterFileMetadata } from '../../../src/interfaces/File';
import { processRasterLoad } from '../../../src/jobs/raster-load/RasterLoader';
import * as PgBossModule from '../../../src/services/PgBoss';
import { GISDataType, IngestionStatus } from '../../../src/types/data';
import { getDataSource } from '../../../src/utils/data-source';
import { GdalCLI } from '../../../src/utils/GdalCLI';
import { addCategory, addDataMapping, addDataset, addFile, addSoilProperty, addUnitConversion } from '../../../src/utils/mock';

const rasterAssetsPath = path.join(__dirname, '../../assets/raster');
// Two bands whose valid data occupies opposite halves of the raster: band 1 the west
// (values 10..77), band 2 the east (172..240). Reading the wrong band is therefore visible
// in where the footprints land, not just in the pixel values.
const MULTIBAND_FILE = 'multiband_2b_250m.tif';
// Striped, no overviews, no COG layout — a raster uploaded without being converted.
const NON_COG_FILE = 'not_a_cog_250m.tif';
// A valid COG that is simply in the wrong CRS, isolating the reprojection path.
const EPSG3857_FILE = 'epsg3857_2b_250m.tif';

// Dataset names double as slugs, so keep them unique within the file.
let datasetCounter = 0;
const uniqueName = (suffix: string): string => `test-raster-load-${(datasetCounter += 1)}-${suffix}`;

const getJob = (dataset_id: string): Job<RasterLoadJob> =>
  ({
    id: 'mock-id',
    name: 'mock-job',
    expireInSeconds: 600,
    signal: AbortSignal.timeout(600000),
    data: {
      type: 'raster-load',
      created_by: 'test-user',
      dataset_id,
      isDataAdmin: true,
      isSuperAdmin: false,
    },
    heartbeatSeconds: 10,
  }) as Job<RasterLoadJob>;

const rasterMetadata = (bandCount: number): RasterFileMetadata => ({
  is_raster: true,
  size: [335, 281],
  band_count: bandCount,
  raster_bands: Array.from({ length: bandCount }, (_, i) => ({
    band_number: i + 1,
    data_type: 'Byte',
    no_data_value: 255,
  })),
});

const bandEntry = (propertySlug: string, minDepth: number, maxDepth: number) => ({
  property_id: propertySlug,
  conversion_id: null,
  min_depth: minDepth,
  max_depth: maxDepth,
});

/**
 * Builds what a Raster Load consumes: a raster dataset, a pending raster file carrying the band
 * metadata probed at upload, and a band mapping linked to both. `buildMapping` receives the soil
 * property slug the mapping should reference; returning null links the file with no mapping.
 */
const setUpRasterLoad = async (
  name: string,
  buildMapping: (propertySlug: string) => Record<string, unknown> | null,
  options?: { bandCount?: number; fileName?: string },
) => {
  const dataSource = await getDataSource();
  const dataset = await addDataset(name, [-180, -90, 180, 90], GISDataType.RASTER);
  const category = await addCategory(`category-${name}`);
  const property = await addSoilProperty(`property-${name}`, category.id);

  const fileName = options?.fileName ?? MULTIBAND_FILE;
  const fileRepo = dataSource.getRepository(FileEntity);
  const file = await fileRepo.save(
    fileRepo.create({
      name: fileName,
      file_path: fileName,
      created_by: 'tests',
      status: IngestionStatus.PENDING,
      metadata: rasterMetadata(options?.bandCount ?? 2),
    }),
  );

  const mapping = buildMapping(property.slug);
  const dataMapping = mapping ? await addDataMapping(mapping) : null;

  const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
  await mappingRepo.save(
    mappingRepo.create({
      dataset_id: dataset.id,
      file_id: file.id,
      ...(dataMapping ? { data_mapping_id: dataMapping.id } : {}),
    }),
  );

  return { dataset, file, property };
};

const getLayers = async (fileId: string): Promise<RasterLayerEntity[]> => {
  const dataSource = await getDataSource();
  return dataSource.getRepository(RasterLayerEntity).find({ where: { file_id: fileId }, order: { band: 'ASC' } });
};

const footprintCentroidX = async (rasterLayerId: string): Promise<number> => {
  const dataSource = await getDataSource();
  const [row] = await dataSource.query(
    `SELECT ST_X(ST_Centroid(ST_Collect(rf.geom))) AS x
     FROM raster_layer_footprints rlf JOIN raster_footprints rf ON rf.id = rlf.raster_footprint_id
     WHERE rlf.raster_layer_id = $1`,
    [rasterLayerId],
  );
  return Number(row.x);
};

/**
 * Points local storage at a scratch copy of the given fixtures.
 *
 * Normalization writes the converted raster back into storage, so tests that trigger it must not
 * run against tests/assets/raster — the output would land in the repo beside the fixtures.
 */
const tempStorageDirs: string[] = [];
const useScratchStorage = (...fixtures: string[]): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raster-load-storage-'));
  for (const fixture of fixtures) {
    fs.copyFileSync(path.join(rasterAssetsPath, fixture), path.join(dir, fixture));
  }
  process.env.LOCAL_STORAGE_ROOT_FOLDER = dir;
  tempStorageDirs.push(dir);
  return dir;
};

describe('RasterLoader', () => {
  beforeEach(() => {
    process.env.STORAGE_MODE = 'local';
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rasterAssetsPath;
  });

  afterEach(() => {
    while (tempStorageDirs.length > 0) {
      fs.rmSync(tempStorageDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('ingests every mapped band as its own raster layer and rolls the dataset up', async () => {
    const { dataset, file } = await setUpRasterLoad(uniqueName('multiband'), slug => ({
      '1': bandEntry(slug, 0, 5),
      '2': bandEntry(slug, 5, 15),
    }));

    await processRasterLoad(getJob(dataset.slug));

    const layers = await getLayers(file.id);
    expect(layers.map(l => l.band)).toEqual([1, 2]);
    expect(layers.map(l => [l.min_depth, l.max_depth])).toEqual([
      [0, 5],
      [5, 15],
    ]);
    expect(layers.every(l => l.resolution_m > 0)).toBe(true);

    const dataSource = await getDataSource();
    const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
    expect(reloaded.status).toBe(IngestionStatus.LOADED);
    expect(reloaded.n_raster_layers).toBe(2);
    expect(reloaded.soil_depth).toEqual({ min: 0, max: 15 });

    const reloadedFile = await dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id });
    expect(reloadedFile.status).toBe(IngestionStatus.LOADED);
  });

  it('derives footprints per band rather than reusing band 1 for every layer', async () => {
    const { dataset, file } = await setUpRasterLoad(uniqueName('footprints'), slug => ({
      '1': bandEntry(slug, 0, 5),
      '2': bandEntry(slug, 5, 15),
    }));

    await processRasterLoad(getJob(dataset.slug));

    const [band1, band2] = await getLayers(file.id);
    // Band 1's valid pixels are the western half, band 2's the eastern half. Reading the wrong
    // band would put both sets of footprints in the same place.
    expect(await footprintCentroidX(band1!.id)).toBeLessThan(await footprintCentroidX(band2!.id));
  });

  it('ingests only the bands the mapping names, leaving unmapped bands alone', async () => {
    const { dataset, file } = await setUpRasterLoad(uniqueName('subset'), slug => ({
      '2': bandEntry(slug, 5, 15),
    }));

    await processRasterLoad(getJob(dataset.slug));

    const layers = await getLayers(file.id);
    expect(layers).toHaveLength(1);
    expect(layers[0]!.band).toBe(2);
  });

  it('never deletes the source file — after a raster load the file is the layer data', async () => {
    const { dataset } = await setUpRasterLoad(uniqueName('keeps-source'), slug => ({ '1': bandEntry(slug, 0, 5) }));

    await processRasterLoad(getJob(dataset.slug));

    expect(fs.existsSync(path.join(rasterAssetsPath, MULTIBAND_FILE))).toBe(true);
  });

  it('is safe to re-run: a second load updates the same layers instead of duplicating them', async () => {
    const { dataset, file } = await setUpRasterLoad(uniqueName('rerun'), slug => ({
      '1': bandEntry(slug, 0, 5),
      '2': bandEntry(slug, 5, 15),
    }));

    await processRasterLoad(getJob(dataset.slug));
    const firstIds = (await getLayers(file.id)).map(l => l.id);

    // A re-run only picks the file up again if it is pending, as it would be after a failure.
    const dataSource = await getDataSource();
    await dataSource.getRepository(FileEntity).update({ id: file.id }, { status: IngestionStatus.PENDING });
    await processRasterLoad(getJob(dataset.slug));

    expect((await getLayers(file.id)).map(l => l.id)).toEqual(firstIds);
    const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
    expect(reloaded.n_raster_layers).toBe(2);
  });

  it('reports progress per band, monotonically, finishing at 100', async () => {
    const reported: [number, string][] = [];
    const spy = jest.spyOn(PgBossModule, 'progressReporter').mockImplementation(() => async (percentage, description) => {
      reported.push([percentage, description]);
    });

    try {
      const { dataset } = await setUpRasterLoad(uniqueName('progress'), slug => ({
        '1': bandEntry(slug, 0, 5),
        '2': bandEntry(slug, 5, 15),
      }));

      await processRasterLoad(getJob(dataset.slug));

      expect(reported[0]![0]).toBe(0);
      expect(reported[reported.length - 1]).toEqual([100, 'Raster load complete']);
      expect(reported.some(([, description]) => description.includes('Ingesting band 1'))).toBe(true);
      expect(reported.some(([, description]) => description.includes('Ingesting band 2'))).toBe(true);

      const percentages = reported.map(([percentage]) => percentage);
      expect(percentages).toEqual([...percentages].sort((a, b) => a - b));
    } finally {
      spy.mockRestore();
    }
  });

  describe('layer description', () => {
    it("stores the mapping's layer_description wrapped under a description key", async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('description'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), layer_description: 'Topsoil prediction, 2019 epoch.' },
        '2': bandEntry(slug, 5, 15),
      }));

      await processRasterLoad(getJob(dataset.slug));

      const [band1, band2] = await getLayers(file.id);
      // Wrapped rather than stored as a bare string, so the jsonb column keeps saying what is in
      // it and a second descriptive facet is an added key (docs/adr/0019).
      expect(band1!.description).toEqual({ description: 'Topsoil prediction, 2019 epoch.' });
      // A band that declares none gets none, rather than inheriting a sibling's.
      expect(band2!.description).toBeNull();
    });

    it('refreshes the description on re-run, clearing it when the mapping drops it', async () => {
      const { dataset, file, property } = await setUpRasterLoad(uniqueName('description-rerun'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), layer_description: 'First wording.' },
      }));

      await processRasterLoad(getJob(dataset.slug));
      expect((await getLayers(file.id))[0]!.description).toEqual({ description: 'First wording.' });

      // The band mapping is authoritative for the description, as it is for every other layer
      // field: dropping layer_description clears what the previous load wrote.
      const dataSource = await getDataSource();
      const dataMapping = await addDataMapping({ '1': bandEntry(property.slug, 0, 5) });
      await dataSource
        .getRepository(DatasetFileMappingEntity)
        .update({ dataset_id: dataset.id, file_id: file.id }, { data_mapping_id: dataMapping.id });
      await dataSource.getRepository(FileEntity).update({ id: file.id }, { status: IngestionStatus.PENDING });

      await processRasterLoad(getJob(dataset.slug));

      const layers = await getLayers(file.id);
      expect(layers).toHaveLength(1);
      expect(layers[0]!.description).toBeNull();
    });
  });

  describe('layer assets', () => {
    const getAssets = async (rasterLayerId: string): Promise<RasterLayerAssetEntity[]> => {
      const dataSource = await getDataSource();
      return dataSource.getRepository(RasterLayerAssetEntity).find({ where: { raster_layer_id: rasterLayerId } });
    };

    it('attaches one asset per declared resource to that band’s layer', async () => {
      const manual = await addFile(uniqueName('manual'));
      const companion = await addFile(uniqueName('companion'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }, { file_id: companion.slug }] },
        '2': bandEntry(slug, 5, 15),
      }));

      await processRasterLoad(getJob(dataset.slug));

      const [band1, band2] = await getLayers(file.id);
      // Declared by slug, stored as the File's uuid.
      expect((await getAssets(band1!.id)).map(asset => asset.file_id).sort()).toEqual([manual.id, companion.id].sort());
      // Resources are declared per band, so a band that names none gets none.
      expect(await getAssets(band2!.id)).toHaveLength(0);
    });

    it('gives each band its own asset row when two bands name the same file', async () => {
      const manual = await addFile(uniqueName('shared-manual'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-shared'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }] },
        '2': { ...bandEntry(slug, 5, 15), additional_resources: [{ file_id: manual.slug }] },
      }));

      await processRasterLoad(getJob(dataset.slug));

      const [band1, band2] = await getLayers(file.id);
      expect((await getAssets(band1!.id)).map(asset => asset.file_id)).toEqual([manual.id]);
      expect((await getAssets(band2!.id)).map(asset => asset.file_id)).toEqual([manual.id]);
    });

    it('uses the file_id and skips the url when an entry carries both', async () => {
      const manual = await addFile(uniqueName('both-keys'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-both'), slug => ({
        '1': {
          ...bandEntry(slug, 0, 5),
          additional_resources: [{ file_id: manual.slug, url: 'https://example.invalid/manual.pdf' }],
        },
      }));

      // The url is documentation of where the file came from; nothing fetches it, so a host that
      // does not resolve is harmless.
      await processRasterLoad(getJob(dataset.slug));

      const [band1] = await getLayers(file.id);
      expect((await getAssets(band1!.id)).map(asset => asset.file_id)).toEqual([manual.id]);
    });

    it('is safe to re-run: a second load adds no duplicate assets', async () => {
      const manual = await addFile(uniqueName('rerun-manual'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-rerun'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }] },
      }));

      await processRasterLoad(getJob(dataset.slug));
      const firstIds = (await getAssets((await getLayers(file.id))[0]!.id)).map(asset => asset.id);
      expect(firstIds).toHaveLength(1);

      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update({ id: file.id }, { status: IngestionStatus.PENDING });
      await processRasterLoad(getJob(dataset.slug));

      // Identity is the pair (raster layer, file), so the same declaration re-attaches nothing.
      expect((await getAssets((await getLayers(file.id))[0]!.id)).map(asset => asset.id)).toEqual(firstIds);
    });

    it('deduplicates a resource the same band names twice', async () => {
      const manual = await addFile(uniqueName('twice-manual'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-twice'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }, { file_id: manual.slug }] },
      }));

      await processRasterLoad(getJob(dataset.slug));

      expect(await getAssets((await getLayers(file.id))[0]!.id)).toHaveLength(1);
    });

    it('RL_ASSET_URL_UNSUPPORTED when a resource is declared by url alone', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-url'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ url: 'https://example.org/manual.pdf' }] },
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_ASSET_URL_UNSUPPORTED',
      });

      // Resources are validated with the bands, before the first ingest writes anything.
      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('RL_MISSING_ASSET_REFERENCE when a resource names neither key', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-empty'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{}] },
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_MISSING_ASSET_REFERENCE',
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('RL_ASSET_FILE_NOT_FOUND when no file has that slug', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-missing'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: 'no-such-manual' }] },
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_ASSET_FILE_NOT_FOUND',
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('RL_ASSET_FILE_NOT_FOUND when the referenced file was deleted', async () => {
      const manual = await addFile(uniqueName('deleted-manual'));
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-deleted'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }] },
      }));
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).softDelete({ id: manual.id });

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_ASSET_FILE_NOT_FOUND',
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('resolves a file by a slug it used to have, so a rename does not break the mapping', async () => {
      const manual = await addFile(uniqueName('renamed-manual'));
      const originalSlug = manual.slug;
      const { dataset, file } = await setUpRasterLoad(uniqueName('assets-renamed'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: originalSlug }] },
      }));

      // Renaming regenerates the slug and keeps the old one in slug_history, which is what
      // resolving through getEntity buys over a lookup on the current slug alone.
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update({ id: manual.id }, { name: uniqueName('manual-new-name') });
      const renamed = await dataSource.getRepository(FileEntity).findOneByOrFail({ id: manual.id });
      expect(renamed.slug).not.toBe(originalSlug);

      await processRasterLoad(getJob(dataset.slug));

      expect((await getAssets((await getLayers(file.id))[0]!.id)).map(asset => asset.file_id)).toEqual([manual.id]);
    });
  });

  describe('format normalization', () => {
    const filePathOf = async (fileId: string): Promise<string> => {
      const dataSource = await getDataSource();
      return (await dataSource.getRepository(FileEntity).findOneByOrFail({ id: fileId })).file_path;
    };

    it('converts a non-COG raster instead of refusing it, and repoints the file at the result', async () => {
      const storageDir = useScratchStorage(NON_COG_FILE);
      const { dataset, file } = await setUpRasterLoad(uniqueName('convert-cog'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        bandCount: 1,
        fileName: NON_COG_FILE,
      });

      await processRasterLoad(getJob(dataset.slug));

      const layers = await getLayers(file.id);
      expect(layers).toHaveLength(1);

      const converted = await filePathOf(file.id);
      expect(converted).toBe('not_a_cog_250m_cog.tif');
      expect(fs.existsSync(path.join(storageDir, converted))).toBe(true);
      // The unnormalized original is the only copy of the source data and is left in place.
      expect(fs.existsSync(path.join(storageDir, NON_COG_FILE))).toBe(true);

      // The output really is a COG, so a re-run finds nothing left to convert.
      const info = await GdalCLI.gdalinfo(path.join(storageDir, converted));
      expect(info.metadata?.IMAGE_STRUCTURE?.LAYOUT).toBe('COG');
    });

    it('reprojects a raster that is not EPSG:4326', async () => {
      const storageDir = useScratchStorage(EPSG3857_FILE);
      const { dataset, file } = await setUpRasterLoad(uniqueName('convert-crs'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        fileName: EPSG3857_FILE,
      });

      await processRasterLoad(getJob(dataset.slug));

      expect(await getLayers(file.id)).toHaveLength(1);
      const converted = await filePathOf(file.id);
      expect(converted).not.toBe(EPSG3857_FILE);

      const info = await GdalCLI.gdalinfo(path.join(storageDir, converted));
      expect(GdalCLI.extractEpsgFromWkt(info.coordinateSystem?.wkt)).toBe(4326);

      // bbox is stored in 4326; unreprojected 3857 metres would be far outside these bounds.
      const dataSource = await getDataSource();
      const [row] = await dataSource.query(`SELECT ST_XMin(bbox) AS xmin, ST_XMax(bbox) AS xmax FROM raster_layers WHERE file_id = $1`, [
        file.id,
      ]);
      expect(Number(row.xmin)).toBeGreaterThanOrEqual(-180);
      expect(Number(row.xmax)).toBeLessThanOrEqual(180);
    });

    it('scales each band by its own conversion factor', async () => {
      const storageDir = useScratchStorage(MULTIBAND_FILE);
      const dataSource = await getDataSource();
      const category = await addCategory('category-per-band');
      const property = await addSoilProperty('property-per-band', category.id, 'mg/kg');
      const thousandFold = await addUnitConversion(property.id, 'g/kg', 'x*1000');
      const tenFold = await addUnitConversion(property.id, 'cg/kg', 'x*10');

      const dataset = await addDataset(uniqueName('per-band-scaling'), [-180, -90, 180, 90], GISDataType.RASTER);
      const fileRepo = dataSource.getRepository(FileEntity);
      const file = await fileRepo.save(
        fileRepo.create({
          name: MULTIBAND_FILE,
          file_path: MULTIBAND_FILE,
          created_by: 'tests',
          status: IngestionStatus.PENDING,
          metadata: rasterMetadata(2),
        }),
      );
      const dataMapping = await addDataMapping({
        '1': { property_id: property.slug, conversion_id: thousandFold.slug, min_depth: 0, max_depth: 5 },
        '2': { property_id: property.slug, conversion_id: tenFold.slug, min_depth: 5, max_depth: 15 },
      });
      const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
      await mappingRepo.save(mappingRepo.create({ dataset_id: dataset.id, file_id: file.id, data_mapping_id: dataMapping.id }));

      await processRasterLoad(getJob(dataset.slug));

      expect((await getLayers(file.id)).map(l => l.band)).toEqual([1, 2]);

      const converted = (await fileRepo.findOneByOrFail({ id: file.id })).file_path;
      const tiff = await fromFile(path.join(storageDir, converted));
      const image = await tiff.getImage(0);
      const [band1, band2] = (await image.readRasters({ samples: [0, 1] })) as unknown as ArrayLike<number>[];
      const maxOf = (data: ArrayLike<number>): number => {
        let max = -Infinity;
        for (let i = 0; i < data.length; i++) max = Math.max(max, data[i] as number);
        return max;
      };

      // Source maxima are 77 (band 1) and 240 (band 2). Different factors must land on different
      // multiples — a single broadcast factor would scale both by the same amount.
      expect(maxOf(band1!)).toBeCloseTo(77 * 1000, 0);
      expect(maxOf(band2!)).toBeCloseTo(240 * 10, 0);
    });

    it('leaves a conforming raster untouched', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('no-convert'), slug => ({ '1': bandEntry(slug, 0, 5) }));

      await processRasterLoad(getJob(dataset.slug));

      expect(await filePathOf(file.id)).toBe(MULTIBAND_FILE);
    });

    it('gives conversion the first 40% of progress, and starts band ingestion there', async () => {
      useScratchStorage(NON_COG_FILE);
      const reported: [number, string][] = [];
      const spy = jest.spyOn(PgBossModule, 'progressReporter').mockImplementation(() => async (percentage, description) => {
        reported.push([percentage, description]);
      });

      try {
        const { dataset } = await setUpRasterLoad(uniqueName('convert-progress'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
          bandCount: 1,
          fileName: NON_COG_FILE,
        });

        await processRasterLoad(getJob(dataset.slug));

        const normalizing = reported.filter(([, description]) => /Normalizing|Converting|Storing/.test(description));
        expect(normalizing.length).toBeGreaterThan(0);
        expect(normalizing.every(([percentage]) => percentage <= 40)).toBe(true);

        // convertRaster forwards gdal_translate's own progress bar for the final COG encode
        // (stepProgress in RasterIngestService.ts), not just the 0/20/85/100 checkpoints — those
        // live updates land inside checkFileFormat's [20, 85] sub-range, which this single-file,
        // no-reprojection load then rescales into [8, 34] of the overall 0..40 conversion window.
        const cogProgress = reported.filter(([, description]) => description === 'Converting to Cloud Optimized GeoTIFF...');
        expect(cogProgress.length).toBeGreaterThan(0);
        expect(cogProgress.every(([percentage]) => percentage >= 8 && percentage <= 34)).toBe(true);

        const ingesting = reported.filter(([, description]) => description.includes('Ingesting band'));
        expect(ingesting.length).toBeGreaterThan(0);
        expect(ingesting.every(([percentage]) => percentage >= 40)).toBe(true);

        const percentages = reported.map(([percentage]) => percentage);
        expect(percentages).toEqual([...percentages].sort((a, b) => a - b));
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('ingests the current mapping of a file and ignores superseded ones', async () => {
    // A file can carry several dataset_file_mappings (the table is unique on the triple including
    // data_mapping_id), which direct API use can produce. Only the most recently touched governs
    // the load — see ADR 0020.
    const { dataset, file, property } = await setUpRasterLoad(uniqueName('superseded'), slug => ({
      '1': bandEntry(slug, 0, 5),
      '2': bandEntry(slug, 5, 15),
    }));

    const dataSource = await getDataSource();
    const currentDataMapping = await addDataMapping({ '2': bandEntry(property.slug, 20, 40) });
    const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
    await mappingRepo.save(mappingRepo.create({ dataset_id: dataset.id, file_id: file.id, data_mapping_id: currentDataMapping.id }));
    // now() is transaction-wide, so both rows may share a timestamp to the microsecond — make the
    // ordering explicit rather than relying on insertion happening in separate transactions.
    await dataSource.query(`UPDATE dataset_file_mappings SET updated_at = updated_at + interval '1 hour' WHERE data_mapping_id = $1`, [
      currentDataMapping.id,
    ]);

    await processRasterLoad(getJob(dataset.slug));

    // Band 1 came only from the superseded mapping, so it must not have been ingested, and band 2
    // must carry the current mapping's depths rather than the superseded ones.
    const layers = await getLayers(file.id);
    expect(layers.map(l => l.band)).toEqual([2]);
    expect(layers.map(l => [l.min_depth, l.max_depth])).toEqual([[20, 40]]);
  });

  describe('failures', () => {
    it('RL_MAPPING_NOT_CONFIGURED when the file has no data mapping linked', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('no-mapping'), () => null);

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_MAPPING_NOT_CONFIGURED',
        params: { file_name: file.name },
      });
    });

    it('RL_MISSING_BAND_MAPPING when the mapping names no bands', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('empty-mapping'), () => ({}));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_MISSING_BAND_MAPPING',
        params: { file_name: file.name },
      });
    });

    it('RL_INVALID_BAND when the mapping names a band the file does not have', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('bad-band'), slug => ({
        '1': bandEntry(slug, 0, 5),
        '5': bandEntry(slug, 5, 15),
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_INVALID_BAND',
      });

      // Bands are validated for every file before the first ingest writes anything, so the
      // valid band 1 must not have been loaded either.
      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('returns the dataset to PENDING and leaves the file pending when a load fails', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('failure-status'), () => null);

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toThrow();

      const dataSource = await getDataSource();
      const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
      expect(reloaded.status).toBe(IngestionStatus.PENDING);
      const reloadedFile = await dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id });
      expect(reloadedFile.status).toBe(IngestionStatus.PENDING);
    });

    it('RL_UNIT_NOT_CONVERTIBLE when the unit conversion is not a single multiplication', async () => {
      const dataSource = await getDataSource();
      const category = await addCategory('category-nonlinear');
      // 'x / 10' cannot be expressed as --conversion_factor, so it cannot be applied automatically.
      const property = await addSoilProperty('property-nonlinear', category.id, 'mg/kg');
      const conversion = await addUnitConversion(property.id, 'g/kg', 'x / 10');

      const dataset = await addDataset(uniqueName('nonlinear-unit'), [-180, -90, 180, 90], GISDataType.RASTER);
      const fileRepo = dataSource.getRepository(FileEntity);
      const file = await fileRepo.save(
        fileRepo.create({
          name: MULTIBAND_FILE,
          file_path: MULTIBAND_FILE,
          created_by: 'tests',
          status: IngestionStatus.PENDING,
          metadata: rasterMetadata(2),
        }),
      );
      const dataMapping = await addDataMapping({
        '1': { property_id: property.slug, conversion_id: conversion.slug, min_depth: 0, max_depth: 5 },
      });
      const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
      await mappingRepo.save(mappingRepo.create({ dataset_id: dataset.id, file_id: file.id, data_mapping_id: dataMapping.id }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_UNIT_NOT_CONVERTIBLE',
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('ignores files that are not pending', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('not-pending'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update({ id: file.id }, { status: IngestionStatus.LOADED });

      await processRasterLoad(getJob(dataset.slug));

      expect(await getLayers(file.id)).toHaveLength(0);
      const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
      expect(reloaded.status).toBe(IngestionStatus.LOADED);
      expect(reloaded.n_raster_layers).toBe(0);
    });
  });
});
