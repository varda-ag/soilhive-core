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
import * as RasterIngestModule from '../../../src/services/RasterIngestService';
import * as LoadLayerAssetsModule from '../../../src/jobs/raster-load/LoadLayerAssets';
import * as UpdateDatasetMetadataModule from '../../../src/jobs/raster-load/UpdateDatasetMetadata';
import { GISDataType, IngestionStatus, UnitConversionType } from '../../../src/types/data';
import { getDataSource } from '../../../src/utils/data-source';
import { GdalCLI } from '../../../src/utils/GdalCLI';
import { log } from '../../../src/utils/logger';
import { addCategory, addDataMapping, addDataset, addFile, addSoilProperty, addUnitConversion } from '../../../src/utils/mock';
import * as computeRasterFootprints from '../../../src/scripts/computeRasterFootprints';
import { writableAssets } from '../../assets';

// ingestRaster runs the real pipeline — at the production MIN_TILES=256 floor that's 60s+ per call even for these tiny fixtures.
(computeRasterFootprints as unknown as { MIN_TILES: number }).MIN_TILES = 16;

const rasterAssetsPath = writableAssets('raster');
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

const bandEntry = (propertySlug: string, minDepth: number, maxDepth: number, conversion_id: string | null = null) => ({
  property_id: propertySlug,
  conversion_id,
  min_depth: minDepth,
  max_depth: maxDepth,
});

/** One unit conversion for setUpRasterLoad to create against its own internal property. */
interface UnitConversionSpec {
  originalUnit: string;
  formula?: string;
  type?: UnitConversionType;
}

/**
 * Builds what a Raster Load consumes: a raster dataset, a pending raster file carrying the band
 * metadata probed at upload, and a band mapping linked to both. `buildMapping` receives the soil
 * property slug the mapping should reference, the slug of the unit conversion created from
 * `options.unitConversion` (undefined unless that option is given), and the slugs of the
 * conversions created from `options.unitConversions` for per-band conversions (undefined unless that
 * option is given) — returning null links the file with no mapping.
 */
const setUpRasterLoad = async (
  name: string,
  buildMapping: (propertySlug: string, conversionSlug?: string, conversionSlugs?: string[]) => Record<string, unknown> | null,
  options?: {
    bandCount?: number;
    fileName?: string;
    unitConversion?: UnitConversionSpec;
    unitConversions?: UnitConversionSpec[];
    status?: IngestionStatus;
  },
) => {
  const dataSource = await getDataSource();
  const dataset = await addDataset(name, [-180, -90, 180, 90], GISDataType.RASTER);
  // addDataset publishes, but a dataset reaching its first load has not been yet.
  dataset.status = options?.status ?? IngestionStatus.PENDING;
  await dataSource.getRepository(DatasetEntity).update({ id: dataset.id }, { status: dataset.status });
  const category = await addCategory(`category-${name}`);
  const property = await addSoilProperty(`property-${name}`, category.id);
  const conversion = options?.unitConversion
    ? await addUnitConversion(property.id, options.unitConversion.originalUnit, options.unitConversion.formula, options.unitConversion.type)
    : null;
  const conversions = options?.unitConversions
    ? await Promise.all(options.unitConversions.map(c => addUnitConversion(property.id, c.originalUnit, c.formula, c.type)))
    : undefined;

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

  const mapping = buildMapping(
    property.slug,
    conversion?.slug,
    conversions?.map(c => c.slug),
  );
  const dataMapping = mapping ? await addDataMapping(mapping) : null;

  const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
  await mappingRepo.save(
    mappingRepo.create({
      dataset_id: dataset.id,
      file_id: file.id,
      ...(dataMapping ? { data_mapping_id: dataMapping.id } : {}),
    }),
  );

  return { dataset, file, property, conversion, conversions };
};

/**
 * Re-declares a file's band mapping the way the mapping step does — repointing its dataset file
 * mapping at a new data mapping — and puts the file back to PENDING, as updateMapping does when the
 * content changed.
 */
const remap = async (datasetId: string, fileId: string, mapping: Record<string, unknown>): Promise<void> => {
  const dataSource = await getDataSource();
  const dataMapping = await addDataMapping(mapping);
  await dataSource
    .getRepository(DatasetFileMappingEntity)
    .update({ dataset_id: datasetId, file_id: fileId }, { data_mapping_id: dataMapping.id });
  await dataSource.getRepository(FileEntity).update({ id: fileId }, { status: IngestionStatus.PENDING });
};

/** Adds a second pending raster file to a dataset, mapped with `mapping`. */
const addRasterFile = async (datasetId: string, fileName: string, mapping: Record<string, unknown>): Promise<FileEntity> => {
  const dataSource = await getDataSource();
  const fileRepo = dataSource.getRepository(FileEntity);
  const file = await fileRepo.save(
    fileRepo.create({
      name: uniqueName('extra-file'),
      file_path: fileName,
      created_by: 'tests',
      status: IngestionStatus.PENDING,
      metadata: rasterMetadata(2),
    }),
  );
  const dataMapping = await addDataMapping(mapping);
  const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
  await mappingRepo.save(mappingRepo.create({ dataset_id: datasetId, file_id: file.id, data_mapping_id: dataMapping.id }));
  return file;
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

    it('scales each band by its own conversion factor, averaging resampled overviews', async () => {
      const storageDir = useScratchStorage(MULTIBAND_FILE);
      const { dataset, file } = await setUpRasterLoad(
        uniqueName('per-band-scaling'),
        (slug, _conversionSlug, conversionSlugs) => ({
          '1': { property_id: slug, conversion_id: conversionSlugs![0], min_depth: 0, max_depth: 5 },
          '2': { property_id: slug, conversion_id: conversionSlugs![1], min_depth: 5, max_depth: 15 },
        }),
        {
          fileName: MULTIBAND_FILE,
          unitConversions: [
            { originalUnit: 'g/kg', formula: 'x*1000' },
            { originalUnit: 'cg/kg', formula: 'x*10' },
          ],
        },
      );
      const dataSource = await getDataSource();
      const fileRepo = dataSource.getRepository(FileEntity);

      const translate = jest.spyOn(GdalCLI, 'translate');
      try {
        await processRasterLoad(getJob(dataset.slug));
        const cogArgs = translate.mock.calls.find(([, dst]) => dst.endsWith('_cog.tif'))?.[2] ?? [];
        expect(cogArgs).toContain('OVERVIEW_RESAMPLING=AVERAGE');
      } finally {
        translate.mockRestore();
      }

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

    it('does not re-apply the unit-conversion factor or rename the file again on a retry', async () => {
      const storageDir = useScratchStorage(MULTIBAND_FILE);
      const { dataset, file } = await setUpRasterLoad(
        uniqueName('retry-scaling'),
        (slug, conversionSlug) => ({ '1': { property_id: slug, conversion_id: conversionSlug, min_depth: 0, max_depth: 5 } }),
        { bandCount: 1, fileName: MULTIBAND_FILE, unitConversion: { originalUnit: 'cg/kg', formula: 'x*10' } },
      );

      const dataSource = await getDataSource();
      const fileRepo = dataSource.getRepository(FileEntity);

      const maxOfBand1 = async (filePath: string): Promise<number> => {
        const tiff = await fromFile(path.join(storageDir, filePath));
        const image = await tiff.getImage(0);
        const [band1] = (await image.readRasters({ samples: [0] })) as unknown as ArrayLike<number>[];
        let max = -Infinity;
        for (let i = 0; i < band1!.length; i++) max = Math.max(max, band1![i] as number);
        return max;
      };

      await processRasterLoad(getJob(dataset.slug));
      const afterFirst = await fileRepo.findOneByOrFail({ id: file.id });
      // Source max is 77; a single x10 application lands here.
      expect(await maxOfBand1(afterFirst.file_path)).toBeCloseTo(77 * 10, 0);

      // Simulates a retried job: re-running against the same file and (unchanged) mapping must not
      // re-derive "needs scaling" from the mapping's still-x10 conversion_id and apply it again.
      await processRasterLoad(getJob(dataset.slug));
      const afterRetry = await fileRepo.findOneByOrFail({ id: file.id });

      expect(afterRetry.file_path).toBe(afterFirst.file_path);
      expect(await maxOfBand1(afterRetry.file_path)).toBeCloseTo(77 * 10, 0);
    });

    it('leaves a conforming raster untouched', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('no-convert'), slug => ({ '1': bandEntry(slug, 0, 5) }));

      await processRasterLoad(getJob(dataset.slug));

      expect(await filePathOf(file.id)).toBe(MULTIBAND_FILE);
    });

    it('leaves a non-4326 raster untouched but stores its bbox and footprints reprojected to EPSG:4326', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('non-4326'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        fileName: EPSG3857_FILE,
      });

      await processRasterLoad(getJob(dataset.slug));

      // Already a COG, and CRS is no longer a conversion trigger — the file passes through as-is.
      expect(await filePathOf(file.id)).toBe(EPSG3857_FILE);

      const [layer] = await getLayers(file.id);
      expect(layer).toBeDefined();

      // Native extent is Web Mercator metres (~-9.03M..-8.96M, ~-4.03M..-3.95M) around 81°W, 34°S.
      // Unreprojected metres would fail every one of these bounds, by sign or by magnitude.
      const dataSource = await getDataSource();
      const [bboxRow] = await dataSource.query(
        `SELECT ST_XMin(bbox) AS xmin, ST_XMax(bbox) AS xmax, ST_YMin(bbox) AS ymin, ST_YMax(bbox) AS ymax
         FROM raster_layers WHERE id = $1`,
        [layer!.id],
      );
      expect(Number(bboxRow.xmin)).toBeGreaterThanOrEqual(-82);
      expect(Number(bboxRow.xmax)).toBeLessThanOrEqual(-80);
      expect(Number(bboxRow.ymin)).toBeGreaterThanOrEqual(-35);
      expect(Number(bboxRow.ymax)).toBeLessThanOrEqual(-33);

      const [footprintRow] = await dataSource.query(
        `SELECT ST_XMin(ST_Collect(rf.geom)) AS xmin, ST_XMax(ST_Collect(rf.geom)) AS xmax
         FROM raster_layer_footprints rlf JOIN raster_footprints rf ON rf.id = rlf.raster_footprint_id
         WHERE rlf.raster_layer_id = $1`,
        [layer!.id],
      );
      expect(Number(footprintRow.xmin)).toBeGreaterThanOrEqual(-82);
      expect(Number(footprintRow.xmax)).toBeLessThanOrEqual(-80);
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

  describe('is_categorical', () => {
    it('persists is_categorical=true when the property has classes', async () => {
      const name = uniqueName('categorical');
      const category = await addCategory(`category-classed-${name}`);
      const classed = await addSoilProperty(`property-classed-${name}`, category.id, 'code 1-12', { '1': { label: 'Clay' } });
      const { dataset, file } = await setUpRasterLoad(name, () => ({ '1': bandEntry(classed.slug, 0, 5) }));

      await processRasterLoad(getJob(dataset.slug));

      const [layer] = await getLayers(file.id);
      expect(layer!.is_categorical).toBe(true);
    });

    it('persists is_categorical=false for a CATEGORY_MAPPING conversion without classes', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('mapping-only'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        unitConversion: { originalUnit: 'code 1-12', formula: 'x', type: UnitConversionType.CATEGORY_MAPPING },
      });

      await processRasterLoad(getJob(dataset.slug));

      const [layer] = await getLayers(file.id);
      expect(layer!.is_categorical).toBe(false);
    });

    it('persists is_categorical=false for a plain numeric mapping', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('continuous'), slug => ({ '1': bandEntry(slug, 0, 5) }));

      await processRasterLoad(getJob(dataset.slug));

      const [layer] = await getLayers(file.id);
      expect(layer!.is_categorical).toBe(false);
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

  describe('empty mapping', () => {
    it('skips a file whose mapping declares no bands, without failing the job', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('empty-mapping'), () => ({}));
      const spy = jest.spyOn(log, 'warn');

      try {
        await processRasterLoad(getJob(dataset.slug));

        expect(await getLayers(file.id)).toHaveLength(0);
        expect(spy).toHaveBeenCalledWith('Skipping file with an empty data mapping', expect.objectContaining({ file_id: file.id }));

        const dataSource = await getDataSource();
        const reloadedFile = await dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id });
        expect(reloadedFile.status).toBe(IngestionStatus.PENDING);
      } finally {
        spy.mockRestore();
      }
    });

    it('still loads a sibling file when another file in the dataset has an empty mapping', async () => {
      const {
        dataset,
        file: emptyFile,
        property,
      } = await setUpRasterLoad(uniqueName('empty-plus-valid'), () => ({}), { fileName: NON_COG_FILE });

      const dataSource = await getDataSource();
      const fileRepo = dataSource.getRepository(FileEntity);
      const validFile = await fileRepo.save(
        fileRepo.create({
          name: uniqueName('valid-file'),
          file_path: MULTIBAND_FILE,
          created_by: 'tests',
          status: IngestionStatus.PENDING,
          metadata: rasterMetadata(2),
        }),
      );
      const dataMapping = await addDataMapping({ '1': bandEntry(property.slug, 0, 5) });
      const mappingRepo = dataSource.getRepository(DatasetFileMappingEntity);
      await mappingRepo.save(mappingRepo.create({ dataset_id: dataset.id, file_id: validFile.id, data_mapping_id: dataMapping.id }));

      await processRasterLoad(getJob(dataset.slug));

      expect(await getLayers(emptyFile.id)).toHaveLength(0);
      const validLayers = await getLayers(validFile.id);
      expect(validLayers.map(l => l.band)).toEqual([1]);

      const reloadedEmptyFile = await fileRepo.findOneByOrFail({ id: emptyFile.id });
      expect(reloadedEmptyFile.status).toBe(IngestionStatus.PENDING);
      const reloadedValidFile = await fileRepo.findOneByOrFail({ id: validFile.id });
      expect(reloadedValidFile.status).toBe(IngestionStatus.LOADED);
    });
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

    it('RL_INVALID_REFERENCE_PERIOD when a band declares a year outside four digits', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('bad-period'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), reference_period_start: '20255' },
        '2': bandEntry(slug, 5, 15),
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_INVALID_REFERENCE_PERIOD',
        params: { band: '1', field: 'reference period start', value: '20255' },
      });

      // Checked with the band numbers, before the first ingest writes anything — the value used to
      // reach every layer intact and fail only when it was rolled up into the dataset.
      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('accepts a year, a year and month, or a full date as a reference period', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('good-period'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), reference_period_start: '1977', reference_period_stop: '2015-06' },
        '2': { ...bandEntry(slug, 5, 15), reference_period_start: '2016-01-31' },
      }));

      await processRasterLoad(getJob(dataset.slug));

      expect((await getLayers(file.id)).map(layer => layer.reference_period_start)).toEqual(['1977', '2016-01-31']);
      const dataSource = await getDataSource();
      const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
      expect(reloaded.status).toBe(IngestionStatus.LOADED);
      expect(reloaded.reference_period_start).toBe('1977');
    });

    // Depths land in `int` columns, so a fraction was rounded on the way in and the layer then
    // described an interval nobody chose. The mapping step refuses these at entry; this is the
    // same rule for a Band Mapping written straight through the API.
    it.each([
      ['a fractional depth', { min_depth: 0, max_depth: 5.5 }, 'max depth', '5.5'],
      ['a negative depth', { min_depth: -10, max_depth: 5 }, 'min depth', '-10'],
      ['a depth past the 5000cm ceiling', { min_depth: 0, max_depth: 50000 }, 'max depth', '50000'],
    ])('RL_INVALID_DEPTH when a band declares %s', async (_label, depths, field, value) => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('bad-depth'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), ...depths },
        '2': bandEntry(slug, 5, 15),
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_INVALID_DEPTH',
        params: { band: '1', field, value, limit: '5000' },
      });

      // Checked with the band numbers, before the first ingest writes anything — so the valid
      // band 2 must not have been loaded either.
      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('RL_INVALID_DEPTH_RANGE when a band declares a min depth that is not below its max', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('bad-depth-range'), slug => ({
        '1': { ...bandEntry(slug, 30, 10) },
      }));

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_INVALID_DEPTH_RANGE',
        params: { band: '1', min_depth: '30', max_depth: '10' },
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    // The surface, the ceiling itself, and a band that declares no depth at all: the columns are
    // nullable, and requiring a depth here would fail datasets that have always loaded without one.
    it('accepts a depth of zero, the ceiling itself, and no depth at all', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('good-depth'), slug => ({
        '1': { ...bandEntry(slug, 0, 5000) },
        '2': { property_id: slug, conversion_id: null, min_depth: null, max_depth: null },
      }));

      await processRasterLoad(getJob(dataset.slug));

      const layers = await getLayers(file.id);
      expect(layers.map(layer => [layer.min_depth, layer.max_depth])).toEqual([
        [0, 5000],
        [null, null],
      ]);
    });

    it('returns a never-loaded dataset to PENDING and leaves the file pending when a load fails', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('failure-status'), () => null);

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toThrow();

      const dataSource = await getDataSource();
      const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
      expect(reloaded.status).toBe(IngestionStatus.PENDING);
      const reloadedFile = await dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id });
      expect(reloadedFile.status).toBe(IngestionStatus.PENDING);
    });

    it('RL_UNIT_NOT_CONVERTIBLE when the unit conversion is not a single multiplication', async () => {
      // 'x / 10' cannot be expressed as --conversion_factor, so it cannot be applied automatically.
      const { dataset, file } = await setUpRasterLoad(
        uniqueName('nonlinear-unit'),
        (slug, conversionSlug) => ({ '1': bandEntry(slug, 0, 5, conversionSlug ?? null) }),
        { unitConversion: { originalUnit: 'g/kg', formula: 'x / 10' } },
      );

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_UNIT_NOT_CONVERTIBLE',
      });

      expect(await getLayers(file.id)).toHaveLength(0);
    });

    it('puts a file back to PENDING when the load fails after marking it LOADED, so the retry finds it', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('rollup-failure'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      // File status is written before the rollup, so this is the latest a load can fail.
      const rollup = jest
        .spyOn(UpdateDatasetMetadataModule, 'updateRasterDatasetMetadata')
        .mockRejectedValueOnce(new Error('rollup exploded'));

      try {
        await expect(processRasterLoad(getJob(dataset.slug))).rejects.toThrow('rollup exploded');
      } finally {
        rollup.mockRestore();
      }

      const dataSource = await getDataSource();
      expect((await dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id })).status).toBe(IngestionStatus.PENDING);

      await processRasterLoad(getJob(dataset.slug));

      expect((await getLayers(file.id)).map(layer => layer.band)).toEqual([1]);
      const reloaded = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
      expect(reloaded.status).toBe(IngestionStatus.LOADED);
      expect(reloaded.n_raster_layers).toBe(1);
    });
  });

  describe('loading into a loaded or published dataset', () => {
    const getFile = async (fileId: string): Promise<FileEntity> => {
      const dataSource = await getDataSource();
      return dataSource.getRepository(FileEntity).findOneByOrFail({ id: fileId });
    };
    const getDataset = async (datasetId: string): Promise<DatasetEntity> => {
      const dataSource = await getDataSource();
      return dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: datasetId });
    };

    it('ingests only the new file, leaving the layers of a loaded one untouched', async () => {
      const { dataset, file, property } = await setUpRasterLoad(uniqueName('add-file'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      await processRasterLoad(getJob(dataset.slug));
      const [before] = await getLayers(file.id);

      const added = await addRasterFile(dataset.id, EPSG3857_FILE, { '2': bandEntry(property.slug, 5, 15) });
      const ingest = jest.spyOn(RasterIngestModule, 'ingestRaster');
      try {
        await processRasterLoad(getJob(dataset.slug));
        expect(ingest.mock.calls.map(([opts]) => opts.fileId)).toEqual([added.id]);
      } finally {
        ingest.mockRestore();
      }

      const [after] = await getLayers(file.id);
      expect(after!.id).toBe(before!.id);
      expect(after!.updated_at).toEqual(before!.updated_at);
      expect((await getLayers(added.id)).map(layer => layer.band)).toEqual([2]);
      expect((await getDataset(dataset.id)).n_raster_layers).toBe(2);
    });

    it('hides a PUBLISHED dataset while it loads and publishes it again afterwards', async () => {
      const { dataset } = await setUpRasterLoad(uniqueName('published'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        status: IngestionStatus.PUBLISHED,
      });
      const statusesWhileIngesting: string[] = [];
      const spy = jest.spyOn(PgBossModule, 'progressReporter').mockImplementation(() => async (_percentage, description) => {
        if (description.includes('Ingesting band')) {
          statusesWhileIngesting.push((await getDataset(dataset.id)).status);
        }
      });

      try {
        await processRasterLoad(getJob(dataset.slug));
      } finally {
        spy.mockRestore();
      }

      expect(statusesWhileIngesting.length).toBeGreaterThan(0);
      expect(statusesWhileIngesting.every(status => status === IngestionStatus.ONGOING)).toBe(true);
      expect((await getDataset(dataset.id)).status).toBe(IngestionStatus.PUBLISHED);
    });

    it('applies a metadata-only edit in place, without ingesting the file again', async () => {
      const { dataset, file, property } = await setUpRasterLoad(uniqueName('edit-metadata'), slug => ({
        '1': bandEntry(slug, 0, 5),
        '2': bandEntry(slug, 5, 15),
      }));
      await processRasterLoad(getJob(dataset.slug));
      const before = await getLayers(file.id);
      const footprintsBefore = await footprintCentroidX(before[0]!.id);

      await remap(dataset.id, file.id, {
        '1': { ...bandEntry(property.slug, 0, 10), layer_description: 'Corrected depth.', reference_period_start: '2001' },
        '2': bandEntry(property.slug, 10, 30),
      });
      const ingest = jest.spyOn(RasterIngestModule, 'ingestRaster');
      try {
        await processRasterLoad(getJob(dataset.slug));
        expect(ingest).not.toHaveBeenCalled();
      } finally {
        ingest.mockRestore();
      }

      const after = await getLayers(file.id);
      expect(after.map(layer => layer.id)).toEqual(before.map(layer => layer.id));
      expect(after.map(layer => [layer.min_depth, layer.max_depth])).toEqual([
        [0, 10],
        [10, 30],
      ]);
      expect(after[0]!.description).toEqual({ description: 'Corrected depth.' });
      expect(after[0]!.reference_period_start).toBe('2001');
      expect(await footprintCentroidX(after[0]!.id)).toBe(footprintsBefore);
      expect((await getFile(file.id)).status).toBe(IngestionStatus.LOADED);
      expect((await getDataset(dataset.id)).soil_depth).toEqual({ min: 0, max: 30 });
    });

    it('deletes the layer of a band the mapping stopped naming', async () => {
      const { dataset, file, property } = await setUpRasterLoad(uniqueName('remove-band'), slug => ({
        '1': bandEntry(slug, 0, 5),
        '2': bandEntry(slug, 5, 15),
      }));
      await processRasterLoad(getJob(dataset.slug));

      await remap(dataset.id, file.id, { '1': bandEntry(property.slug, 0, 5) });
      await processRasterLoad(getJob(dataset.slug));

      expect((await getLayers(file.id)).map(layer => layer.band)).toEqual([1]);
      expect((await getDataset(dataset.id)).n_raster_layers).toBe(1);
    });

    it('removes every layer of a loaded file whose mapping now declares no bands', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('unmap-all'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      await processRasterLoad(getJob(dataset.slug));

      await remap(dataset.id, file.id, {});
      await processRasterLoad(getJob(dataset.slug));

      expect(await getLayers(file.id)).toHaveLength(0);
      const reloadedFile = await getFile(file.id);
      expect(reloadedFile.status).toBe(IngestionStatus.PENDING);
      expect((reloadedFile.metadata as RasterFileMetadata).loaded_bands).toBeUndefined();
    });

    it('unlinks an asset the mapping stopped declaring and attaches a new one', async () => {
      const manual = await addFile(uniqueName('kept-manual'));
      const retracted = await addFile(uniqueName('retracted-manual'));
      const added = await addFile(uniqueName('added-manual'));
      const { dataset, file, property } = await setUpRasterLoad(uniqueName('edit-assets'), slug => ({
        '1': { ...bandEntry(slug, 0, 5), additional_resources: [{ file_id: manual.slug }, { file_id: retracted.slug }] },
      }));
      await processRasterLoad(getJob(dataset.slug));

      await remap(dataset.id, file.id, {
        '1': { ...bandEntry(property.slug, 0, 5), additional_resources: [{ file_id: manual.slug }, { file_id: added.slug }] },
      });
      await processRasterLoad(getJob(dataset.slug));

      const dataSource = await getDataSource();
      const [layer] = await getLayers(file.id);
      const assets = await dataSource.getRepository(RasterLayerAssetEntity).find({ where: { raster_layer_id: layer!.id } });
      expect(assets.map(asset => asset.file_id).sort()).toEqual([manual.id, added.id].sort());
    });

    it('re-normalizes from the source when the unit conversion changes, rather than scaling the scaled file', async () => {
      const storageDir = useScratchStorage(MULTIBAND_FILE);
      const { dataset, file, property, conversions } = await setUpRasterLoad(
        uniqueName('edit-conversion'),
        (slug, _conversionSlug, conversionSlugs) => ({ '1': bandEntry(slug, 0, 5, conversionSlugs![0]!) }),
        {
          bandCount: 1,
          fileName: MULTIBAND_FILE,
          unitConversions: [
            { originalUnit: 'cg/kg', formula: 'x*10' },
            { originalUnit: 'g/kg', formula: 'x*1000' },
          ],
        },
      );
      const maxOfBand1 = async (): Promise<number> => {
        const tiff = await fromFile(path.join(storageDir, (await getFile(file.id)).file_path));
        const [band1] = (await (await tiff.getImage(0)).readRasters({ samples: [0] })) as unknown as ArrayLike<number>[];
        let max = -Infinity;
        for (let i = 0; i < band1!.length; i++) max = Math.max(max, band1![i] as number);
        return max;
      };

      await processRasterLoad(getJob(dataset.slug));
      expect(await maxOfBand1()).toBeCloseTo(77 * 10, 0);
      const [before] = await getLayers(file.id);

      await remap(dataset.id, file.id, { '1': bandEntry(property.slug, 0, 5, conversions![1]!.slug) });
      await processRasterLoad(getJob(dataset.slug));

      // From the source's 77, not from the first run's 770.
      expect(await maxOfBand1()).toBeCloseTo(77 * 1000, 0);
      expect((await getFile(file.id)).metadata).toMatchObject({ source_file_path: MULTIBAND_FILE, unit_conversion_applied: true });
      // Re-ingested in place: the layer keeps its identity.
      expect((await getLayers(file.id)).map(layer => layer.id)).toEqual([before!.id]);
    });

    it('rebuilds the COG with fresh overviews when a band flips between continuous and categorical', async () => {
      useScratchStorage(MULTIBAND_FILE);
      const name = uniqueName('edit-categorical');
      const { dataset, file } = await setUpRasterLoad(name, slug => ({ '1': bandEntry(slug, 0, 5) }), { bandCount: 1 });
      await processRasterLoad(getJob(dataset.slug));
      // An uploaded COG is left as it is, so nothing has been converted yet.
      expect((await getFile(file.id)).file_path).toBe(MULTIBAND_FILE);

      const category = await addCategory(`category-classed-${name}`);
      const classed = await addSoilProperty(`property-classed-${name}`, category.id, 'code 1-12', { '1': { label: 'Clay' } });
      await remap(dataset.id, file.id, { '1': bandEntry(classed.slug, 0, 5) });

      const translate = jest.spyOn(GdalCLI, 'translate');
      try {
        await processRasterLoad(getJob(dataset.slug));
        const cogArgs = translate.mock.calls.find(([, dst]) => dst.endsWith('_cog.tif'))?.[2] ?? [];
        expect(cogArgs).toContain('OVERVIEWS=IGNORE_EXISTING');
        expect(cogArgs).toContain('OVERVIEW_RESAMPLING=NEAREST');
      } finally {
        translate.mockRestore();
      }

      const [layer] = await getLayers(file.id);
      expect(layer!.is_categorical).toBe(true);
    });

    it('refuses to re-normalize a scaled file whose source cannot be found', async () => {
      const { dataset, file } = await setUpRasterLoad(uniqueName('lost-source'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      // A file normalized before source_file_path was recorded, whose original is gone.
      const dataSource = await getDataSource();
      await dataSource.query(
        `UPDATE files SET file_path = 'gone_cog.tif', metadata = metadata || '{"unit_conversion_applied": true}'::jsonb WHERE id = $1`,
        [file.id],
      );

      await expect(processRasterLoad(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'RL_SOURCE_FILE_NOT_FOUND',
        params: { file_name: file.name },
      });
    });

    it('on failure, removes the layers of the files it touched and publishes the dataset again', async () => {
      const {
        dataset,
        file: edited,
        property,
      } = await setUpRasterLoad(uniqueName('edit-failure'), slug => ({ '1': bandEntry(slug, 0, 5) }), {
        status: IngestionStatus.PUBLISHED,
      });
      const untouched = await addRasterFile(dataset.id, EPSG3857_FILE, { '2': bandEntry(property.slug, 5, 15) });
      await processRasterLoad(getJob(dataset.slug));

      await remap(dataset.id, edited.id, { '1': bandEntry(property.slug, 0, 10) });
      // Fails after the edited file's layers were rewritten.
      const sync = jest.spyOn(LoadLayerAssetsModule, 'syncRasterLayerAssets').mockRejectedValueOnce(new Error('sync exploded'));
      try {
        await expect(processRasterLoad(getJob(dataset.slug))).rejects.toThrow('sync exploded');
      } finally {
        sync.mockRestore();
      }

      expect(await getLayers(edited.id)).toHaveLength(0);
      const editedFile = await getFile(edited.id);
      expect(editedFile.status).toBe(IngestionStatus.PENDING);
      expect((editedFile.metadata as RasterFileMetadata).loaded_bands).toBeUndefined();
      // A file the load never touched keeps its published layer.
      expect((await getLayers(untouched.id)).map(layer => layer.band)).toEqual([2]);
      const reloaded = await getDataset(dataset.id);
      expect(reloaded.status).toBe(IngestionStatus.PUBLISHED);
      expect(reloaded.n_raster_layers).toBe(1);

      // The retry ingests the edited file from scratch.
      await processRasterLoad(getJob(dataset.slug));
      expect((await getLayers(edited.id)).map(layer => [layer.min_depth, layer.max_depth])).toEqual([[0, 10]]);
    });

    it('on failure, leaves the layers of a pending file it never reached', async () => {
      const { dataset, file: edited, property } = await setUpRasterLoad(uniqueName('unreached'), slug => ({ '1': bandEntry(slug, 0, 5) }));
      await processRasterLoad(getJob(dataset.slug));

      // The edit is applied after every ingest, so a failing ingest of a new file comes first.
      await remap(dataset.id, edited.id, { '1': bandEntry(property.slug, 0, 10) });
      await addRasterFile(dataset.id, EPSG3857_FILE, { '2': bandEntry(property.slug, 5, 15) });
      const ingest = jest.spyOn(RasterIngestModule, 'ingestRaster').mockRejectedValueOnce(new Error('ingest exploded'));
      try {
        await expect(processRasterLoad(getJob(dataset.slug))).rejects.toThrow('ingest exploded');
      } finally {
        ingest.mockRestore();
      }

      expect((await getLayers(edited.id)).map(layer => [layer.min_depth, layer.max_depth])).toEqual([[0, 5]]);
      expect((await getFile(edited.id)).status).toBe(IngestionStatus.PENDING);
      expect((await getDataset(dataset.id)).status).toBe(IngestionStatus.LOADED);
    });
  });
});
