import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { EntityManager } from 'typeorm';
import { Job } from 'pg-boss';
import DatasetFileMappingService from '../../src/services/DatasetFileMappingService';
import DatasetEntity from '../../src/entities/Dataset';
import DatasetFileMappingEntity from '../../src/entities/DatasetFileMapping';
import FileEntity from '../../src/entities/File';
import RasterLayerEntity from '../../src/entities/RasterLayer';
import RasterLayerAssetEntity from '../../src/entities/RasterLayerAsset';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { IngestionStatus } from '../../src/types/data';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { ErrorResponse } from '../../src/utils/error';
import { updateRasterDatasetMetadata } from '../../src/jobs/raster-load/UpdateDatasetMetadata';
import { processRasterLoad } from '../../src/jobs/raster-load/RasterLoader';
import FileService from '../../src/services/FileService';
import { RasterLoadJob } from '../../src/interfaces/Job';
import { JobQueues } from '../../src/types/enums';
import { addAssetToRasterLayer, addDataMapping, addDataset, addDatasetFileMapping, addFile, addRasterData } from '../../src/utils/mock';
import * as computeRasterFootprints from '../../src/scripts/computeRasterFootprints';
import { writableAsset, writableAssets } from '../assets';

// As in BulkDeleter.test.ts: the production MIN_TILES floor makes each addRasterData call take a minute
(computeRasterFootprints as unknown as { MIN_TILES: number }).MIN_TILES = 16;

const DEFAULT_RASTER_FIXTURE = 'sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2_250.tif';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: true,
  isInternalRequest: false,
};

const service = new DatasetFileMappingService();

let entityManager: EntityManager;
let requestData: RequestData;
let counter = 0;
const uniqueName = (suffix: string): string => `dfm-loaded-${(counter += 1)}-${suffix}`;

/** A distinct copy of the default fixture: same footprints, but its own File (see BulkDeleter.test.ts). */
const copyOfDefaultFixture = (suffix: string): string => {
  const fixture = path.join(writableAssets('raster'), DEFAULT_RASTER_FIXTURE);
  const copy = fixture.replace(/\.tif$/, `_${suffix}.tif`);
  if (!fs.existsSync(copy)) fs.copyFileSync(fixture, copy);
  return copy;
};

/** Marks the File loaded as a raster or a vector, and maps it into the Dataset. */
const loadedFile = async (file: FileEntity, datasetId: string, isRaster: boolean, mapping: object = {}): Promise<FileEntity> => {
  const dataSource = await getDataSource();
  await dataSource.query(`UPDATE files SET status = $2, metadata = $3::jsonb WHERE id = $1`, [
    file.id,
    IngestionStatus.LOADED,
    JSON.stringify(isRaster ? { is_raster: true, size: [10, 10], band_count: 1, raster_bands: [] } : { is_raster: false }),
  ]);
  const existing = await dataSource.getRepository(DatasetFileMappingEntity).findOneBy({ dataset_id: datasetId, file_id: file.id });
  if (!existing) {
    const dfm = await addDatasetFileMapping(datasetId, (await addDataMapping(mapping)).id);
    await dataSource.getRepository(DatasetFileMappingEntity).update({ id: dfm.id }, { file_id: file.id });
  }
  return dataSource.getRepository(FileEntity).findOneByOrFail({ id: file.id });
};

const rasterLoadJob = (dataset_id: string) =>
  ({
    id: `job-${(counter += 1)}`,
    name: JobQueues.RASTER_LOAD,
    expireInSeconds: 600,
    signal: AbortSignal.timeout(600000),
    data: { type: JobQueues.RASTER_LOAD, created_by: 'test-user', dataset_id, isDataAdmin: true, isSuperAdmin: false },
    heartbeatSeconds: 10,
  }) as unknown as Job<RasterLoadJob>;

const getDataset = async (id: string): Promise<DatasetEntity> =>
  (await getDataSource()).getRepository(DatasetEntity).findOneByOrFail({ id });

const layersOf = async (fileId: string): Promise<RasterLayerEntity[]> =>
  (await getDataSource()).getRepository(RasterLayerEntity).find({ where: { file_id: fileId } });

const footprintsOf = async (layerIds: string[]): Promise<string[]> =>
  (
    await (
      await getDataSource()
    ).query(`SELECT DISTINCT raster_footprint_id AS id FROM raster_layer_footprints WHERE raster_layer_id = ANY($1::uuid[])`, [layerIds])
  )
    .map((r: { id: string }) => r.id)
    .sort();

/**
 * A published raster Dataset of three loaded Files: two copies of one raster, which share their
 * footprints, and a raster with its own extent, on another continent so removing it shrinks the
 * Dataset's extent (bdod_5-15cm_mean.tif lies inside the default fixture).
 */
const publishedRasterDataset = async (name: string) => {
  const shared = await addRasterData(copyOfDefaultFixture(`${name}_a`), { dataset: name });
  const sibling = await addRasterData(copyOfDefaultFixture(`${name}_b`), { dataset: name });
  const own = await addRasterData(writableAsset('raster/ph_0-10cm_4326.tif'), { dataset: name });
  const datasetId = shared.dataset_id!;
  for (const layer of [shared, sibling, own]) {
    await loadedFile(layer.file!, datasetId, true);
  }
  const dataSource = await getDataSource();
  await updateRasterDatasetMetadata(dataSource.manager, datasetId, IngestionStatus.PUBLISHED, null);
  return { dataset: await getDataset(datasetId), shared, sibling, own };
};

describe('DatasetFileMappingService — loaded Files', () => {
  beforeAll(async () => {
    entityManager = await getEntityManager();
    requestData = { entityManager, token: mockToken, entitlements: {} };
  });

  describe('updateMapping', () => {
    it.each([
      ['raster', true],
      ['vector', false],
    ])('refuses a content change to a loaded %s File with 409', async (_kind, isRaster) => {
      const dataset = await addDataset(uniqueName('edit'), [0, 0, 1, 1]);
      const file = await loadedFile(await addFile(uniqueName('file')), dataset.id, isRaster, { '1': { property_id: 'a' } });
      const [dfm] = await service.getMappings(requestData, dataset.slug);
      const edited = await addDataMapping({ '1': { property_id: 'b' } });

      const update = service.updateMapping(requestData, dataset.slug, dfm!.id, { mappingId: edited.id });

      await expect(update).rejects.toBeInstanceOf(ErrorResponse);
      await expect(update).rejects.toMatchObject({ status: 409 });
      const reloaded = await (await getDataSource()).getRepository(FileEntity).findOneByOrFail({ id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.LOADED);
    });

    it('accepts a data mapping with the same content, leaving the File LOADED', async () => {
      const dataset = await addDataset(uniqueName('same'), [0, 0, 1, 1]);
      const file = await loadedFile(await addFile(uniqueName('file')), dataset.id, true, { '1': { property_id: 'a' } });
      const [dfm] = await service.getMappings(requestData, dataset.slug);
      const same = await addDataMapping({ '1': { property_id: 'a' } });

      const updated = await service.updateMapping(requestData, dataset.slug, dfm!.id, { mappingId: same.id });

      expect(updated.data_mapping_id).toBe(same.id);
      const reloaded = await (await getDataSource()).getRepository(FileEntity).findOneByOrFail({ id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.LOADED);
    });
  });

  describe('removing a loaded vector File', () => {
    it('is refused with 409 by both routes, leaving its mapping and File in place', async () => {
      const dataset = await addDataset(uniqueName('vector'), [0, 0, 1, 1]);
      const file = await loadedFile(await addFile(uniqueName('file')), dataset.id, false);

      await expect(service.deleteDataMappingByFileId(requestData, dataset.slug, file.slug)).rejects.toMatchObject({ status: 409 });
      await expect(DatasetFileMappingService.assertFileDeletable(requestData, file.slug)).rejects.toMatchObject({ status: 409 });

      expect(await service.getMappings(requestData, dataset.slug)).toHaveLength(1);
      const reloaded = await (await getDataSource()).getRepository(FileEntity).findOneBy({ id: file.id });
      expect(reloaded?.status).toBe(IngestionStatus.LOADED);
    });

    it('still removes a vector File that is not loaded yet', async () => {
      const dataset = await addDataset(uniqueName('vector-pending'), [0, 0, 1, 1]);
      const file = await addFile(uniqueName('file'));
      const dfm = await addDatasetFileMapping(dataset.id, (await addDataMapping({})).id);
      await (await getDataSource()).getRepository(DatasetFileMappingEntity).update({ id: dfm.id }, { file_id: file.id });

      await DatasetFileMappingService.assertFileDeletable(requestData, file.slug);
      await service.deleteDataMappingByFileId(requestData, dataset.slug, file.slug);

      expect(await service.getMappings(requestData, dataset.slug)).toHaveLength(0);
    });
  });

  describe('removing a loaded raster File', () => {
    it('through the mapping route leaves its layers to the raster-load, which removes them with their assets and keeps the Dataset PUBLISHED', async () => {
      const { dataset, own, shared } = await publishedRasterDataset(uniqueName('mapping-route'));
      const asset = await addFile(uniqueName('manual'));
      await addAssetToRasterLayer(own.id, asset.id);
      expect((await footprintsOf([own.id])).length).toBeGreaterThan(0);
      const extentBefore = (await getDataset(dataset.id)).spatial_extent;

      await service.deleteDataMappingByFileId(requestData, dataset.slug, own.file!.slug);

      // The request only drops the mapping: removing the layers can outlast it
      expect(await service.getMappings(requestData, dataset.slug, own.file!.slug)).toHaveLength(0);
      expect(await layersOf(own.file_id!)).toHaveLength(1);

      await processRasterLoad(rasterLoadJob(dataset.slug));

      expect(await layersOf(own.file_id!)).toHaveLength(0);
      const dataSource = await getDataSource();
      expect(await dataSource.getRepository(RasterLayerAssetEntity).findBy({ raster_layer_id: own.id })).toHaveLength(0);
      expect(await dataSource.query(`SELECT 1 FROM raster_layer_footprints WHERE raster_layer_id = $1`, [own.id])).toHaveLength(0);
      const after = await getDataset(dataset.id);
      expect(after.status).toBe(IngestionStatus.PUBLISHED);
      expect(after.n_raster_layers).toBe(2);
      expect(after.spatial_extent).not.toEqual(extentBefore);
      expect(await layersOf(shared.file_id!)).toHaveLength(1);
    });

    it('through the files route leaves its layers to the raster-load, which keeps the footprints another layer shares', async () => {
      const { dataset, shared, sibling } = await publishedRasterDataset(uniqueName('files-route'));
      const siblingFootprints = await footprintsOf([sibling.id]);
      expect(await footprintsOf([shared.id])).toEqual(siblingFootprints);

      await DatasetFileMappingService.assertFileDeletable(requestData, shared.file!.slug);
      await new FileService().deleteFile(requestData, shared.file!.slug);
      expect(await layersOf(shared.file_id!)).toHaveLength(1);

      await processRasterLoad(rasterLoadJob(dataset.slug));

      expect(await layersOf(shared.file_id!)).toHaveLength(0);
      const dataSource = await getDataSource();
      const remaining = await dataSource.query(`SELECT id FROM raster_footprints WHERE id = ANY($1::uuid[])`, [siblingFootprints]);
      expect(remaining).toHaveLength(siblingFootprints.length);
      expect(await footprintsOf([sibling.id])).toEqual(siblingFootprints);
      const after = await getDataset(dataset.id);
      expect(after.status).toBe(IngestionStatus.PUBLISHED);
      expect(after.n_raster_layers).toBe(2);
    });
  });
});
