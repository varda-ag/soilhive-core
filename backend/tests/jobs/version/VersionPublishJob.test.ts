import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { Job } from 'pg-boss';
import { processVersionPublish } from '../../../src/jobs/version/VersionPublishJob';
import * as UpdateDatasetMetadataModule from '../../../src/jobs/bulk-load/UpdateDatasetMetadata';
import DatasetVersionService from '../../../src/services/DatasetVersionService';
import DataMappingService from '../../../src/services/DataMappingService';
import EntitlementService from '../../../src/services/EntitlementService';
import VectorDataLoad from '../../../src/data-layer/VectorDataLoad';
import DatasetEntity from '../../../src/entities/Dataset';
import { VersionPublishJob } from '../../../src/interfaces/Job';
import { Token } from '../../../src/interfaces/Token';
import { RequestData } from '../../../src/interfaces/RequestData';
import { SoilRecord } from '../../../src/interfaces/Record';
import { DataCleaningConfig } from '../../../src/interfaces/DataMapping';
import { GISDataType, IngestionStatus } from '../../../src/types/data';
import { Capability, JobQueues } from '../../../src/types/enums';
import { EntitlementScope } from '../../../src/types/Entitlements';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { addDataset, addFile, addRasterData, addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../../src/utils/mock';
import * as computeRasterFootprints from '../../../src/scripts/computeRasterFootprints';

// addRasterData ingests through the real pipeline; see BulkDeleter.test.ts
(computeRasterFootprints as unknown as { MIN_TILES: number }).MIN_TILES = 16;

const adminToken: Token = {
  sub: 'admin-id',
  email: 'admin@example.com',
  scope: 'data-admin',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: true,
  isInternalRequest: false,
};

const requestDataFor = async (): Promise<RequestData> => ({ entityManager: await getEntityManager(), token: adminToken, entitlements: {} });

const publishJob = (datasetSlug: string, versionSlug: string, settings: Partial<VersionPublishJob> = {}): Job<VersionPublishJob> =>
  ({
    id: 'mock-id',
    name: JobQueues.VERSION_PUBLISH,
    expireInSeconds: 60,
    heartbeatSeconds: 10,
    signal: AbortSignal.timeout(60000),
    data: {
      type: JobQueues.VERSION_PUBLISH,
      dataset_id: datasetSlug,
      version_id: versionSlug,
      created_by: adminToken.email,
      progress_percentage: 0,
      isDataAdmin: true,
      isSuperAdmin: false,
      ...settings,
    },
  }) as unknown as Job<VersionPublishJob>;

const versionService = new DatasetVersionService();
const vdl = new VectorDataLoad();

/** Every Dataset Layer of the Dataset with its observations, comparable across Datasets: features and layers are shared. */
const rowsOf = async (datasetId: string): Promise<unknown[]> =>
  (await getDataSource()).query(
    `SELECT dl.feature_id, dl.layer_id, dl.soil_property_id, o.value::text AS value, o.procedure_id
     FROM dataset_layers dl
     LEFT JOIN observations o ON o.dataset_layer_id = dl.id
     WHERE dl.dataset_id = $1
     ORDER BY 1, 2, 3, 4, 5`,
    [datasetId],
  );

const countRows = async (sql: string, params: unknown[]): Promise<number> => {
  const [{ count }] = await (await getDataSource()).query(`SELECT count(*)::int AS count FROM ${sql}`, params);
  return count;
};

/** Loads the records into the Dataset through today's write path, one at a time as a bulk load does. */
const load = async (config: DataCleaningConfig, records: SoilRecord[], datasetId: string): Promise<void> => {
  const entityManager = await getEntityManager();
  for (const record of records) {
    await vdl.rawRecordToDataModel(entityManager, config, { ...record }, datasetId);
  }
};

/**
 * Two overlapping slices of one raw table, A and B, for a parity check:
 * - records in both are collisions, and their identical observations are dropped;
 * - one of them has a different value in B, which is kept;
 * - A has no value for the second soil property, which only B has.
 *
 * The overlap starts at the first record with a value for the first soil property: the preview
 * returns cleaned values, and the fixture's conversion and max_val null many of them.
 */
const recordsAB = async (id: number) => {
  const fixture = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions, id, createTable: true, tableRows: 20 });
  const config = await new DataMappingService().parseDataMapping(await requestDataFor(), fixture.dataMapping.id);
  const records = (await vdl.getDataPreview(await getEntityManager(), config, fixture.file.id, 20, false)) as SoilRecord[];
  const [first, second] = Object.keys(config.property_cols);
  const valued = records.findIndex(r => Number(r[first!]) > 0);
  expect(valued).toBeGreaterThanOrEqual(0);
  // A ends six records into the overlap, B starts at it
  const a = records.slice(0, valued + 6).map(r => ({ ...r, [second!]: null }));
  const b = records.slice(valued, valued + 12).map(r => ({ ...r }));
  b[0] = { ...b[0]!, [first!]: Number(b[0]![first!]) / 2 };
  return { config, a, b };
};

/** v1 PUBLISHED with A, and a LOADED version of it with B. */
const setUpVersion = async (name: string, id: number) => {
  const { config, a, b } = await recordsAB(id);
  const v1 = await addDataset(name, [0, 0, 1, 1]);
  await load(config, a, v1.id);
  const v2 = await versionService.openVersion(await requestDataFor(), v1.slug);
  await load(config, b, v2.id);
  await (await getDataSource()).query(`UPDATE datasets SET status = $2 WHERE id = $1`, [v2.id, IngestionStatus.LOADED]);
  return { config, a, b, v1, v2 };
};

const getDataset = async (id: string): Promise<DatasetEntity | null> =>
  (await getDataSource()).getRepository(DatasetEntity).findOne({ where: { id }, withDeleted: true });

/** The records with a square of their own each in place of their point, so they load as polygonal features. */
const asPolygons = (records: SoilRecord[]): SoilRecord[] =>
  records.map((record, i) => ({
    ...record,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [i, 0],
          [i, 1],
          [i + 1, 1],
          [i + 1, 0],
          [i, 0],
        ],
      ],
    },
  }));

describe('version-publish', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives the dataset the rows loading A and then B into it would have given', async () => {
    const { config, a, b, v1, v2 } = await setUpVersion('publish-parity', 301);
    const reference = await addDataset('publish-parity-reference', [0, 0, 1, 1]);
    await load(config, a, reference.id);
    await load(config, b, reference.id);
    // The inputs collide: B has Dataset Layers v1 already has
    expect(
      await countRows(
        `dataset_layers dl2 JOIN dataset_layers dl1 ON dl1.dataset_id = $1 AND (dl1.feature_id, dl1.layer_id, dl1.soil_property_id) = (dl2.feature_id, dl2.layer_id, dl2.soil_property_id) WHERE dl2.dataset_id = $2`,
        [v1.id, v2.id],
      ),
    ).toBeGreaterThan(0);

    await processVersionPublish(publishJob(v1.slug, v2.slug));

    const published = await rowsOf(v1.id);
    expect(published.length).toBeGreaterThan(0);
    expect(published).toEqual(await rowsOf(reference.id));
  });

  it('applies the settings, takes the version number and data date, rolls metadata up and removes the version', async () => {
    const { v1, v2 } = await setUpVersion('publish-after', 302);
    const dataSource = await getDataSource();
    await dataSource.query(`UPDATE datasets SET processing_steps = $2 WHERE id = $1`, [
      v1.id,
      JSON.stringify({ description: 'kept', cleaning_steps: { 'file-a': { from: 'v1' } } }),
    ]);
    await dataSource.query(`UPDATE datasets SET processing_steps = $2 WHERE id = $1`, [
      v2.id,
      JSON.stringify({ cleaning_steps: { 'file-b': { from: 'v2' } } }),
    ]);
    // A Dataset File Mapping of the version's, which goes to v1 with its File
    const [{ id: mappingId }] = await dataSource.query(`INSERT INTO dataset_file_mappings (dataset_id) VALUES ($1) RETURNING id`, [v2.id]);

    await processVersionPublish(
      publishJob(v1.slug, v2.slug, { visibility: 'private', entitlements: { 'reader@example.com': [Capability.PREVIEW] } }),
    );

    const after = (await getDataset(v1.id))!;
    expect(after.status).toBe(IngestionStatus.PUBLISHED);
    expect(after.slug).toBe(v1.slug);
    expect(after.version_number).toBe(2);
    expect(after.data_updated_at).toBeInstanceOf(Date);
    expect(after.visibility).toBe('private');
    expect(after.processing_steps).toEqual({
      description: 'kept',
      cleaning_steps: { 'file-a': { from: 'v1' }, 'file-b': { from: 'v2' } },
    });
    // Rolled up from v1's rows as they now are
    expect(Number(after.n_observations)).toBe(
      await countRows(`observations o JOIN dataset_layers dl ON dl.id = o.dataset_layer_id WHERE dl.dataset_id = $1`, [v1.id]),
    );
    const grants = await new EntitlementService().getEntityEntitlements(await requestDataFor(), EntitlementScope.DATASETS, v1.slug);
    expect(grants).toEqual({ 'reader@example.com': [Capability.PREVIEW] });

    // The version is gone, and nothing references it; its slug history stays, so its slug isn't reused
    expect(await getDataset(v2.id)).toBeNull();
    for (const table of ['dataset_layers', 'raster_layers', 'dataset_file_mappings']) {
      expect(await countRows(`${table} WHERE dataset_id = $1`, [v2.id])).toBe(0);
    }
    expect(await countRows(`dataset_file_mappings WHERE id = $1 AND dataset_id = $2`, [mappingId, v1.id])).toBe(1);
    expect(await countRows(`slug_history WHERE entity_id = $1`, [v2.id])).toBe(1);
  });

  it('keeps visibility and grants as the dataset has them when the settings leave them out', async () => {
    const { v1, v2 } = await setUpVersion('publish-kept', 303);
    await new EntitlementService().setEntityEntitlements(await requestDataFor(), EntitlementScope.DATASETS, v1.slug, {
      'kept@example.com': [Capability.DOWNLOAD],
    });

    await processVersionPublish(publishJob(v1.slug, v2.slug));

    expect((await getDataset(v1.id))!.visibility).toBe(v1.visibility);
    const grants = await new EntitlementService().getEntityEntitlements(await requestDataFor(), EntitlementScope.DATASETS, v1.slug);
    expect(grants).toEqual({ 'kept@example.com': [Capability.DOWNLOAD] });
  });

  it("serves the dataset's old data until the publish commits", async () => {
    const { v1, v2 } = await setUpVersion('publish-reads', 304);
    const before = await rowsOf(v1.id);
    // Held inside the transaction, after the rows have moved
    const realRollup = UpdateDatasetMetadataModule.updateDatasetMetadata;
    let reached!: () => void;
    const rollupReached = new Promise<void>(resolve => (reached = resolve));
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    jest.spyOn(UpdateDatasetMetadataModule, 'updateDatasetMetadata').mockImplementation(async (manager, datasetId, status) => {
      reached();
      await gate;
      return realRollup(manager, datasetId, status);
    });

    const publishing = processVersionPublish(publishJob(v1.slug, v2.slug));
    try {
      await rollupReached;
      // Another connection, as a reader's
      expect(await rowsOf(v1.id)).toEqual(before);
      expect(await getDataset(v2.id)).not.toBeNull();
    } finally {
      release();
    }
    await publishing;
    expect(await rowsOf(v1.id)).not.toEqual(before);
  });

  it('publishes nothing when it fails, and a retry publishes', async () => {
    const { v1, v2 } = await setUpVersion('publish-fails', 305);
    const v1Rows = await rowsOf(v1.id);
    const v2Rows = await rowsOf(v2.id);
    // Fails last in the transaction, once everything else has been written
    const spy = jest.spyOn(UpdateDatasetMetadataModule, 'updateDatasetMetadata').mockRejectedValueOnce(new Error('boom'));

    await expect(processVersionPublish(publishJob(v1.slug, v2.slug))).rejects.toThrow('boom');

    expect(await rowsOf(v1.id)).toEqual(v1Rows);
    expect(await rowsOf(v2.id)).toEqual(v2Rows);
    const version = (await getDataset(v2.id))!;
    expect(version.status).toBe(IngestionStatus.LOADED);
    expect(version.deleted_at).toBeNull();
    expect((await getDataset(v1.id))!.version_number).toBe(1);

    spy.mockRestore();
    await processVersionPublish(publishJob(v1.slug, v2.slug));
    expect(await getDataset(v2.id)).toBeNull();
    expect((await getDataset(v1.id))!.version_number).toBe(2);
  });

  it.each([
    ['the version has no loaded data', IngestionStatus.PENDING, 'LOADED'],
    ['the version has files not loaded yet', IngestionStatus.LOADED, 'STAGED'],
  ])('fails without publishing when %s', async (reason, versionStatus, fileStatus) => {
    const { v1, v2 } = await setUpVersion(`publish-refused-${fileStatus}`, fileStatus === 'STAGED' ? 306 : 307);
    const dataSource = await getDataSource();
    await dataSource.query(`UPDATE datasets SET status = $2 WHERE id = $1`, [v2.id, versionStatus]);
    const file = await addFile(`waiting-${fileStatus}.csv`);
    await dataSource.query(`UPDATE files SET status = $2 WHERE id = $1`, [file.id, fileStatus]);
    await dataSource.query(`INSERT INTO dataset_file_mappings (dataset_id, file_id) VALUES ($1, $2)`, [v2.id, file.id]);
    const v1Rows = await rowsOf(v1.id);

    await expect(processVersionPublish(publishJob(v1.slug, v2.slug))).rejects.toMatchObject({
      code: 'VERSION_NOT_PUBLISHABLE',
      params: expect.objectContaining({ reason }),
    });
    expect(await rowsOf(v1.id)).toEqual(v1Rows);
    expect(await getDataset(v2.id)).not.toBeNull();
  });

  it('fails without publishing when the version holds another data type than the dataset', async () => {
    const { config, a, b } = await recordsAB(308);
    const v1 = await addDataset('publish-mixed', [0, 0, 1, 1]);
    await load(config, a, v1.id);
    const v2 = await versionService.openVersion(await requestDataFor(), v1.slug);
    await load(config, asPolygons(b), v2.id);
    // As the soil-data step saves it for vector files: the check reads the rows, not this
    await (
      await getDataSource()
    ).query(`UPDATE datasets SET status = $2, gis_datatype = NULL WHERE id = $1`, [v2.id, IngestionStatus.LOADED]);
    const v1Rows = await rowsOf(v1.id);

    await expect(processVersionPublish(publishJob(v1.slug, v2.slug))).rejects.toMatchObject({
      code: 'VERSION_DATA_TYPES_MIXED',
      params: expect.objectContaining({ data_types: 'point and polygonal' }),
    });
    expect(await rowsOf(v1.id)).toEqual(v1Rows);
    expect((await getDataset(v2.id))!.status).toBe(IngestionStatus.LOADED);
  });

  it("names the data types when the publish's rollup finds two, and publishes nothing", async () => {
    // A version a failed load left holding both, which the check before the transaction missed
    const { v1, v2 } = await setUpVersion('publish-mixed-rollup', 309);
    const v1Rows = await rowsOf(v1.id);
    jest
      .spyOn(UpdateDatasetMetadataModule, 'updateDatasetMetadata')
      .mockRejectedValueOnce(new UpdateDatasetMetadataModule.MixedDataTypesError([GISDataType.POINT, GISDataType.POLYGONAL]));

    await expect(processVersionPublish(publishJob(v1.slug, v2.slug))).rejects.toMatchObject({
      code: 'VERSION_DATA_TYPES_MIXED',
      params: expect.objectContaining({ data_types: 'point and polygonal' }),
    });
    expect(await rowsOf(v1.id)).toEqual(v1Rows);
    expect(await getDataset(v2.id)).not.toBeNull();
  });

  it("moves a raster version's layers to the dataset with their footprints and groups", async () => {
    const v1 = await addDataset('publish-raster', [-180, -90, 180, 90], GISDataType.RASTER);
    const layer = await addRasterData(undefined, { dataset: 'publish-raster v2 increment', dataset_status: IngestionStatus.LOADED });
    const dataSource = await getDataSource();
    await dataSource.query(`UPDATE datasets SET version_of = $2, version_number = 2, visibility = 'private' WHERE id = $1`, [
      layer.dataset_id,
      v1.id,
    ]);
    const version = (await getDataset(layer.dataset_id))!;
    const linksOf = () =>
      dataSource.query(`SELECT raster_footprint_id FROM raster_layer_footprints WHERE raster_layer_id = $1 ORDER BY raster_footprint_id`, [
        layer.id,
      ]);
    const groupsOf = () =>
      dataSource.query(`SELECT layer_group_id FROM raster_layer_group_members WHERE raster_layer_id = $1 ORDER BY layer_group_id`, [
        layer.id,
      ]);
    const links = await linksOf();
    const groups = await groupsOf();
    expect(links.length).toBeGreaterThan(0);

    await processVersionPublish(publishJob(v1.slug, version.slug));

    expect(await countRows(`raster_layers WHERE id = $1 AND dataset_id = $2`, [layer.id, v1.id])).toBe(1);
    expect(await linksOf()).toEqual(links);
    expect(await groupsOf()).toEqual(groups);
    const after = (await getDataset(v1.id))!;
    expect(after.n_raster_layers).toBe(1);
    expect(after.version_number).toBe(2);
    expect(await getDataset(version.id)).toBeNull();
  });
});
