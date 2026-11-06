import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Job } from 'pg-boss';
import DatasetVersionService from '../../src/services/DatasetVersionService';
import DatasetService from '../../src/services/DatasetService';
import JobService from '../../src/services/JobService';
import * as PgBossModule from '../../src/services/PgBoss';
import { processVersionDiscard, processVersionReset } from '../../src/jobs/version/VersionJobs';
import { processSweepOrphanRows } from '../../src/jobs/orphan-cleanup/SweepOrphanRowsJob';
import * as DatasetVersionsModule from '../../src/data-layer/DatasetVersions';
import { softDeleteVersion } from '../../src/data-layer/DatasetVersions';
import { deleteDatasetLayers } from '../../src/data-layer/DatasetRows';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { RequestData } from '../../src/interfaces/RequestData';
import { VersionDiscardJob, VersionResetJob } from '../../src/interfaces/Job';
import DatasetEntity from '../../src/entities/Dataset';
import FileEntity from '../../src/entities/File';
import { GISDataType, IngestionStatus } from '../../src/types/data';
import { JobQueues } from '../../src/types/enums';
import {
  addCategory,
  addDataMapping,
  addDataset,
  addDatasetFileMapping,
  addDatasetLayer,
  addFeatures,
  addFile,
  addLayer,
  addObservations,
  addProcedure,
  addSoilProperty,
  addUnpublishedDataset,
} from '../../src/utils/mock';

const adminToken: Token = {
  sub: 'admin-id',
  email: 'admin@example.com',
  scope: 'data-admin',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: true,
  isInternalRequest: false,
};

const userToken: Token = { ...adminToken, sub: 'user-id', email: 'user@example.com', scope: 'user', isDataAdmin: false };

const requestDataFor = async (token: Token): Promise<RequestData> => ({ entityManager: await getEntityManager(), token, entitlements: {} });

const versionService = new DatasetVersionService();
const datasetService = new DatasetService();

const jobFor = <T>(type: JobQueues, dataset_id: string): Job<T> =>
  ({
    id: 'mock-id',
    name: type,
    expireInSeconds: 60,
    heartbeatSeconds: 10,
    signal: AbortSignal.timeout(10000),
    data: { type, dataset_id, created_by: adminToken.email, progress_percentage: 0, isDataAdmin: true, isSuperAdmin: false },
  }) as unknown as Job<T>;

let layerDepth = 0;

/** One feature with one observation in the Dataset, on its own layer. Returns the feature's and layer's ids. */
const addVectorRows = async (datasetId: string, tag: string): Promise<{ featureId: string; layerId: string }> => {
  // Features are unique by their geometry, so each call gets its own point: a shared one would be
  // referenced by every Dataset that has rows, and never left to sweep
  layerDepth += 1;
  const [feature] = await addFeatures(GISDataType.POINT, [[1 + layerDepth / 1000, 1]]);
  // Layers are unique by their depth among other fields
  const layer = await addLayer(undefined, undefined, layerDepth, layerDepth + 1);
  const category = await addCategory(`category-${tag}`);
  const property = await addSoilProperty(`property-${tag}`, category.id);
  const datasetLayer = await addDatasetLayer(datasetId, layer.id, feature.id, property.id);
  const procedure = await addProcedure(`procedure-${tag}`);
  await addObservations([1], procedure.id, datasetLayer.id);
  return { featureId: feature.id, layerId: layer.id };
};

/** A File mapped to the Dataset, with the given status. */
const addMappedFile = async (datasetId: string, name: string, status: IngestionStatus): Promise<FileEntity> => {
  const file = await addFile(name);
  const mapping = await addDataMapping({ name });
  const dfm = await addDatasetFileMapping(datasetId, mapping.id);
  dfm.file_id = file.id;
  await dfm.save();
  file.status = status;
  return await file.save();
};

const countRows = async (sql: string, params: unknown[]): Promise<number> => {
  const [{ count }] = await (await getDataSource()).query(`SELECT count(*)::int AS count FROM ${sql}`, params);
  return count;
};

describe('DatasetVersionService', () => {
  let sendSpy: jest.Mock;

  beforeEach(() => {
    // The jobs queue an orphan sweep; pg-boss isn't started in this suite
    sendSpy = jest.fn(async () => 'sweep-job-id');
    jest.spyOn(PgBossModule, 'getPgBoss').mockReturnValue({ send: sendSpy } as never);
    // updateDataset queues a DAI refresh
    jest.spyOn(JobService.prototype, 'createJob').mockResolvedValue({ job: {}, joined: false } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('openVersion', () => {
    it('opens a PENDING, private version of a PUBLISHED dataset', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      await (await getDataSource()).getRepository(DatasetEntity).update({ id: v1.id }, { author: 'Ada', citation: 'Survey 2026' });

      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);

      expect(v2).toMatchObject({
        name: 'soil-survey v2 increment',
        slug: 'soil-survey-v2-increment',
        version_of: v1.id,
        version_number: 2,
        status: IngestionStatus.PENDING,
        visibility: 'private',
        author: 'Ada',
        citation: 'Survey 2026',
        gis_datatype: GISDataType.POINT,
        n_observations: null,
        spatial_extent: null,
      });
    });

    it('refuses a dataset that is not PUBLISHED', async () => {
      const v1 = await addUnpublishedDataset('draft', [0, 0, 10, 10]);
      await expect(versionService.openVersion(await requestDataFor(adminToken), v1.slug)).rejects.toMatchObject({ status: 409 });
    });

    it('refuses a second open version, and a version of a version', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const requestData = await requestDataFor(adminToken);
      const v2 = await versionService.openVersion(requestData, v1.slug);

      await expect(versionService.openVersion(requestData, v1.slug)).rejects.toMatchObject({ status: 409 });
      await expect(versionService.openVersion(requestData, v2.slug)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('visibility', () => {
    it('is not found by a non-Privileged caller', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);

      await expect(datasetService.getDataset(await requestDataFor(userToken), v2.slug)).rejects.toMatchObject({ status: 404 });
      const listed = await datasetService.getDatasets(await requestDataFor(userToken));
      expect(listed.map(d => d.slug)).toEqual([v1.slug]);
    });

    it('is left out of the admin listing, which shows it as pending_version on its dataset', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const other = await addDataset('other-survey', [0, 0, 10, 10]);
      const requestData = await requestDataFor(adminToken);
      const v2 = await versionService.openVersion(requestData, v1.slug);

      const listed = await datasetService.getDatasets(requestData);
      expect(listed.map(d => d.slug).sort()).toEqual([v1.slug, other.slug].sort());

      await datasetService.decorateWithVersions(requestData, listed);
      const byId = new Map(listed.map(d => [d.slug, d]));
      expect(byId.get(v1.slug)!.pending_version).toEqual({
        slug: v2.slug,
        number: 2,
        status: IngestionStatus.PENDING,
        updated_at: v2.updated_at,
        queued_job: null,
        active_job: null,
        publishing: false,
      });
      expect(byId.get(other.slug)!.pending_version).toBeNull();
    });

    it('sets no pending_version for a non-Privileged caller', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      await versionService.openVersion(await requestDataFor(adminToken), v1.slug);

      const listed = await datasetService.getDatasets(await requestDataFor(userToken));
      await datasetService.decorateWithVersions(await requestDataFor(userToken), listed);
      expect(listed[0]!.pending_version).toBeUndefined();
    });
  });

  describe('a version is never PUBLISHED', () => {
    it('is refused by the settings route', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const requestData = await requestDataFor(adminToken);
      const v2 = await versionService.openVersion(requestData, v1.slug);

      await expect(datasetService.updateDataset(requestData, v2.slug, { status: IngestionStatus.PUBLISHED })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('is refused by the CHECK constraint', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);

      await expect((await getDataSource()).query(`UPDATE datasets SET status = 'PUBLISHED' WHERE id = $1`, [v2.id])).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
    });
  });

  describe('getVersion', () => {
    it('is 404 for a dataset that is no version of the given one', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const other = await addDataset('other-survey', [0, 0, 10, 10]);
      const requestData = await requestDataFor(adminToken);
      const v2 = await versionService.openVersion(requestData, v1.slug);

      await expect(versionService.getVersion(requestData, other.slug, v2.slug)).rejects.toMatchObject({ status: 404 });
      await expect(versionService.getVersion(requestData, v1.slug, other.slug)).rejects.toMatchObject({ status: 404 });
      await expect(versionService.getVersion(requestData, v1.slug, v2.slug)).resolves.toMatchObject({ id: v2.id });
    });
  });

  describe('version-reset', () => {
    it("deletes the version's Dataset Layers in chunks until none is left, and no other dataset's", async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      await addVectorRows(v1.id, 'v1');
      for (const tag of ['a', 'b', 'c']) {
        await addVectorRows(v2.id, `v2-${tag}`);
      }
      const dataSource = await getDataSource();

      // A chunk of 1, so three rows take several statements, the last one deleting none
      await dataSource.transaction(manager => deleteDatasetLayers(manager, v2.id, 1));

      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v2.id])).toBe(0);
      expect(await countRows(`observations o JOIN dataset_layers dl ON dl.id = o.dataset_layer_id WHERE dl.dataset_id = $1`, [v1.id])).toBe(
        1,
      );
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v1.id])).toBe(1);
    });

    it("removes all of the version's rows, keeps the dataset's, and returns its Files to PENDING", async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      await addVectorRows(v1.id, 'v1');
      await addVectorRows(v2.id, 'v2');
      const loaded = await addMappedFile(v2.id, 'loaded.csv', IngestionStatus.LOADED);
      const staged = await addMappedFile(v2.id, 'staged.csv', IngestionStatus.STAGED);
      const repo = (await getDataSource()).getRepository(DatasetEntity);
      await repo.update(
        { id: v2.id },
        { status: IngestionStatus.LOADED, n_observations: '1', processing_steps: { description: 'kept', cleaning_steps: {} } },
      );

      await processVersionReset(jobFor<VersionResetJob>(JobQueues.VERSION_RESET, v2.slug));

      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v2.id])).toBe(0);
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v1.id])).toBe(1);
      expect(await countRows(`observations o JOIN dataset_layers dl ON dl.id = o.dataset_layer_id WHERE dl.dataset_id = $1`, [v1.id])).toBe(
        1,
      );
      const files = await (await getDataSource()).getRepository(FileEntity).findBy([{ id: loaded.id }, { id: staged.id }]);
      expect(files.map(f => f.status)).toEqual([IngestionStatus.PENDING, IngestionStatus.PENDING]);
      const reset = await repo.findOneByOrFail({ id: v2.id });
      expect(reset).toMatchObject({ status: IngestionStatus.PENDING, n_observations: null, processing_steps: { description: 'kept' } });
      expect(await countRows(`dataset_file_mappings WHERE dataset_id = $1`, [v2.id])).toBe(2);
      expect(sendSpy).toHaveBeenCalledWith(JobQueues.SWEEP_ORPHAN_ROWS, {});
    });

    it('fails on a dataset that is not a version', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      await addVectorRows(v1.id, 'v1');

      await expect(processVersionReset(jobFor<VersionResetJob>(JobQueues.VERSION_RESET, v1.slug))).rejects.toMatchObject({
        code: 'VERSION_NOT_A_VERSION',
      });
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v1.id])).toBe(1);
    });
  });

  describe('version-discard', () => {
    it('removes the version, its Files and its rows, and leaves the dataset unchanged', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      await addVectorRows(v1.id, 'v1');
      await addVectorRows(v2.id, 'v2');
      const file = await addMappedFile(v2.id, 'loaded.csv', IngestionStatus.LOADED);
      const repo = (await getDataSource()).getRepository(DatasetEntity);
      const before = await repo.findOneByOrFail({ id: v1.id });

      await processVersionDiscard(jobFor<VersionDiscardJob>(JobQueues.VERSION_DISCARD, v2.slug));

      expect(await repo.findOne({ where: { id: v2.id }, withDeleted: true })).toBeNull();
      // Kept, so the slug is never reused
      expect(await countRows(`slug_history WHERE entity_id = $1`, [v2.id])).toBe(1);
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v2.id])).toBe(0);
      expect(await countRows(`dataset_file_mappings WHERE dataset_id = $1`, [v2.id])).toBe(0);
      const deletedFile = await (await getDataSource()).getRepository(FileEntity).findOne({ where: { id: file.id }, withDeleted: true });
      expect(deletedFile!.deleted_at).not.toBeNull();

      expect(await repo.findOneByOrFail({ id: v1.id })).toEqual(before);
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v1.id])).toBe(1);

      // The name can be used again, the slug can't: the next version gets a suffixed one, and the old
      // slug no longer resolves
      const reopened = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      expect(reopened.name).toBe(v2.name);
      expect(reopened.slug).toBe(`${v2.slug}-1`);
      await expect(versionService.getVersion(await requestDataFor(adminToken), v1.slug, v2.slug)).rejects.toMatchObject({ status: 404 });
    });

    it('removes a version the discard route already soft-deleted, and does nothing once it is gone', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      await addVectorRows(v2.id, 'v2');
      const dataSource = await getDataSource();
      await softDeleteVersion(dataSource.manager, v2);
      const job = jobFor<VersionDiscardJob>(JobQueues.VERSION_DISCARD, v2.slug);

      await processVersionDiscard(job);

      const repo = dataSource.getRepository(DatasetEntity);
      expect(await repo.findOne({ where: { id: v2.id }, withDeleted: true })).toBeNull();
      expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v2.id])).toBe(0);
      // A retry, or a second discard, finds nothing to do
      await expect(processVersionDiscard(job)).resolves.toBeUndefined();
    });

    describe('when it fails', () => {
      const discardJob = (slug: string) => {
        const job = jobFor<VersionDiscardJob>(JobQueues.VERSION_DISCARD, slug);
        job.data.previous_status = IngestionStatus.LOADED;
        return job;
      };

      it('puts the version back as it was, with its data, as a failed bulk delete does', async () => {
        const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
        const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
        await addVectorRows(v2.id, 'v2');
        const dataSource = await getDataSource();
        await softDeleteVersion(dataSource.manager, v2);
        jest.spyOn(DatasetVersionsModule, 'discardVersionRows').mockRejectedValue(new Error('boom'));

        await expect(processVersionDiscard(discardJob(v2.slug))).rejects.toThrow('boom');

        const restored = await dataSource.getRepository(DatasetEntity).findOneByOrFail({ id: v2.id });
        expect(restored.deleted_at).toBeNull();
        expect(restored.status).toBe(IngestionStatus.LOADED);
        expect(await countRows(`dataset_layers WHERE dataset_id = $1`, [v2.id])).toBe(1);
        // It's the open version again, so it shows in the list with its error and can be discarded again
        const listed = await versionService.getVersion(await requestDataFor(adminToken), v1.slug, v2.slug);
        expect(listed.id).toBe(v2.id);
      });

      it('leaves the version discarded when a new one was opened in the meantime', async () => {
        const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
        const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
        const dataSource = await getDataSource();
        await softDeleteVersion(dataSource.manager, v2);
        const next = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
        jest.spyOn(DatasetVersionsModule, 'discardVersionRows').mockRejectedValue(new Error('boom'));

        await expect(processVersionDiscard(discardJob(v2.slug))).rejects.toThrow('boom');

        const repo = dataSource.getRepository(DatasetEntity);
        expect((await repo.findOneOrFail({ where: { id: v2.id }, withDeleted: true })).deleted_at).not.toBeNull();
        expect((await repo.findOneByOrFail({ id: next.id })).deleted_at).toBeNull();
      });
    });
  });

  describe('sweep-orphan-rows', () => {
    it('deletes only the features and layers no Dataset Layer references', async () => {
      const v1 = await addDataset('soil-survey', [0, 0, 10, 10]);
      const other = await addDataset('other-survey', [0, 0, 10, 10]);
      const v2 = await versionService.openVersion(await requestDataFor(adminToken), v1.slug);
      const kept = await addVectorRows(v1.id, 'v1');
      const orphaned = await addVectorRows(v2.id, 'v2');
      // A feature and layer shared with another Dataset stay when the version's rows go
      const category = await addCategory('category-shared');
      const property = await addSoilProperty('property-shared', category.id);
      await addDatasetLayer(v2.id, kept.layerId, kept.featureId, property.id);
      await addDatasetLayer(other.id, kept.layerId, kept.featureId, property.id);

      await processVersionReset(jobFor<VersionResetJob>(JobQueues.VERSION_RESET, v2.slug));
      await processSweepOrphanRows();

      expect(await countRows(`features WHERE id = $1`, [orphaned.featureId])).toBe(0);
      expect(await countRows(`layers WHERE id = $1`, [orphaned.layerId])).toBe(0);
      expect(await countRows(`features WHERE id = $1`, [kept.featureId])).toBe(1);
      expect(await countRows(`layers WHERE id = $1`, [kept.layerId])).toBe(1);
    });
  });
});
