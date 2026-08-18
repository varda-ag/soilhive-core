import { describe, it, expect, jest } from '@jest/globals';
import path from 'path';
import { Job } from 'pg-boss';
import { QueryFailedError } from 'typeorm';
import DatasetEntity from '../../../src/entities/Dataset';
import { BulkDeleteJob } from '../../../src/interfaces/Job';
import { Token } from '../../../src/interfaces/Token';
import DatasetService from '../../../src/services/DatasetService';
import * as BulkDeleterModule from '../../../src/jobs/bulk-delete/BulkDeleter';
import { IngestionStatus } from '../../../src/types/data';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { addRasterData, addSyntheticData, getLoadedDataCount, syntheticDataOptions } from '../../../src/utils/mock';

const getJob = (dataset_id: string): Job<BulkDeleteJob> => {
  return {
    id: 'mock-id',
    name: 'mock-job',
    expireInSeconds: 60,
    signal: AbortSignal.timeout(10000),
    data: {
      type: 'bulk-delete',
      created_by: 'test-user',
      progress_percentage: 0,
      dataset_id,
      isDataAdmin: true,
      isSuperAdmin: false,
    },
    heartbeatSeconds: 10,
  };
};

describe('BulkDeleter class', () => {
  it('Bulk deleting all synthetic data', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 101, featureCount: 2 });

    expect(dataset.status).toBe(IngestionStatus.PUBLISHED);

    const promise = BulkDeleterModule.processBulkDeletion(getJob(dataset.slug));
    await new Promise(r => setTimeout(r, 50));
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    const datasets = await repo.find();
    expect(datasets.length).toBe(0);

    await promise;

    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(0);
    expect(createdData.n_layers).toBe(0);
    expect(createdData.n_dataset_layers).toBe(0);
    expect(createdData.n_observations).toBe(0);

    const datasetsWithDeleted = await repo.find({ withDeleted: true });
    expect(datasetsWithDeleted.length).toBe(1);
    expect(datasetsWithDeleted[0].status).toBe(IngestionStatus.ARCHIVED);
  });

  it('Bulk deleting synthetic data from the corresponding dataset', async () => {
    const datasetToKeep = (await addSyntheticData({ ...syntheticDataOptions, id: 102, soilPropertyNames: ['pH'] })).dataset;
    const datasetToDelete = (
      await addSyntheticData({ ...syntheticDataOptions, id: 103, soilPropertyNames: ['Bulk density'], featureCount: 3 })
    ).dataset;

    const dataToKeep = await getLoadedDataCount(datasetToKeep.id);

    await BulkDeleterModule.processBulkDeletion(getJob(datasetToDelete.slug));

    const dataPostDeletion = await getLoadedDataCount();
    expect(dataPostDeletion.n_features).toBe(dataToKeep.n_features);
    expect(dataPostDeletion.n_layers).toBe(dataToKeep.n_layers);
    expect(dataPostDeletion.n_dataset_layers).toBe(dataToKeep.n_dataset_layers);
    expect(dataPostDeletion.n_observations).toBe(dataToKeep.n_observations);

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    const datasets = await repo.find({ withDeleted: true });
    expect(datasets.length).toBe(2);
    expect(datasets.filter(d => d.id === datasetToDelete.id)[0].status).toBe(IngestionStatus.ARCHIVED);
  });

  it('removes entitlements to the purged dataset and keeps the others', async () => {
    const datasetToKeep = (await addSyntheticData({ ...syntheticDataOptions, id: 106, soilPropertyNames: ['pH'] })).dataset;
    const datasetToDelete = (
      await addSyntheticData({ ...syntheticDataOptions, id: 107, soilPropertyNames: ['Bulk density'], featureCount: 2 })
    ).dataset;

    const entityManager = await getEntityManager();
    await entityManager.query(
      `INSERT INTO entitlements (id, data) VALUES
        ('everyone', $1),
        ('user1@example.com', $2),
        ('user2@example.com', $3)`,
      [
        JSON.stringify({ [datasetToDelete.slug]: ['download'] }),
        JSON.stringify({ [datasetToDelete.slug]: ['preview'], [datasetToKeep.slug]: ['download'] }),
        JSON.stringify({ [datasetToKeep.slug]: ['preview'] }),
      ],
    );

    await BulkDeleterModule.processBulkDeletion(getJob(datasetToDelete.slug));

    const rows: Array<{ id: string; data: Record<string, string[]> }> = await entityManager.query(
      `SELECT id, data FROM entitlements ORDER BY id`,
    );
    expect(rows.map(r => r.data)).toEqual([
      // 'everyone' held only the purged dataset, so it is left with an empty record
      {},
      { [datasetToKeep.slug]: ['download'] },
      { [datasetToKeep.slug]: ['preview'] },
    ]);
  });

  it('removes entitlements stored under a historical slug of the purged dataset', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 108, featureCount: 1 });
    const originalSlug = dataset.slug;

    const entityManager = await getEntityManager();
    const requestData = { entityManager, token: { sub: 'test-user' } as Token, entitlements: {} };
    await new DatasetService().updateDataset(requestData, originalSlug, { name: 'purged-after-rename' });
    const renamed = await entityManager.getRepository(DatasetEntity).findOneByOrFail({ id: dataset.id });
    expect(renamed.slug).not.toBe(originalSlug);

    // Granted before the rename, so the key is the slug that is now historical
    await entityManager.query(`INSERT INTO entitlements (id, data) VALUES ('user1@example.com', $1)`, [
      JSON.stringify({ [originalSlug]: ['download'] }),
    ]);

    await BulkDeleterModule.processBulkDeletion(getJob(renamed.slug));

    const rows = await entityManager.query(`SELECT data FROM entitlements WHERE id = 'user1@example.com'`);
    expect(rows[0].data).toEqual({});
  });
});

describe('BulkDeleter class - raster datasets', () => {
  it('deletes raster_layers and their footprint links, and archives the dataset', async () => {
    const rasterLayer = await addRasterData(undefined, { dataset: 'bulk-delete-raster-basic' });

    const dataSource = await getDataSource();
    const footprintLinksBefore = await dataSource.query(
      `SELECT raster_footprint_id FROM raster_layer_footprints WHERE raster_layer_id = $1`,
      [rasterLayer.id],
    );
    expect(footprintLinksBefore.length).toBeGreaterThan(0);

    await BulkDeleterModule.processBulkDeletion(getJob(rasterLayer.dataset.slug));

    const layers = await dataSource.query(`SELECT id FROM raster_layers WHERE id = $1`, [rasterLayer.id]);
    expect(layers).toHaveLength(0);

    // The FK from raster_layer_footprints to raster_layers is ON DELETE CASCADE (see the
    // CreateSchema migration): deleting the layer must take its footprint links with it.
    const footprintLinksAfter = await dataSource.query(
      `SELECT raster_footprint_id FROM raster_layer_footprints WHERE raster_layer_id = $1`,
      [rasterLayer.id],
    );
    expect(footprintLinksAfter).toHaveLength(0);

    const repo = dataSource.getRepository(DatasetEntity);
    const archived = await repo.findOne({ where: { id: rasterLayer.dataset_id }, withDeleted: true });
    expect(archived?.status).toBe(IngestionStatus.ARCHIVED);
  });

  it('does not delete raster layers belonging to a different dataset', async () => {
    const keep = await addRasterData(undefined, { dataset: 'bulk-delete-raster-keep' });
    const remove = await addRasterData(path.join(__dirname, '../../assets/raster/bdod_5-15cm_mean.tif'), {
      dataset: 'bulk-delete-raster-remove',
    });

    await BulkDeleterModule.processBulkDeletion(getJob(remove.dataset.slug));

    const dataSource = await getDataSource();
    const kept = await dataSource.query(`SELECT id FROM raster_layers WHERE id = $1`, [keep.id]);
    expect(kept).toHaveLength(1);
    const removed = await dataSource.query(`SELECT id FROM raster_layers WHERE id = $1`, [remove.id]);
    expect(removed).toHaveLength(0);
  });

  // The raster branch returns early from the purge transaction, so the strip has to sit above
  // the data-type fork to reach raster datasets at all (ADR 0027)
  it('removes entitlements to a purged raster dataset', async () => {
    const rasterLayer = await addRasterData(undefined, { dataset: 'bulk-delete-raster-entitled' });

    const entityManager = await getEntityManager();
    await entityManager.query(`INSERT INTO entitlements (id, data) VALUES ('user1@example.com', $1)`, [
      JSON.stringify({ [rasterLayer.dataset.slug]: ['download'] }),
    ]);

    await BulkDeleterModule.processBulkDeletion(getJob(rasterLayer.dataset.slug));

    const rows = await entityManager.query(`SELECT data FROM entitlements WHERE id = 'user1@example.com'`);
    expect(rows[0].data).toEqual({});
  });
});

describe('BulkDeleter class - errors', () => {
  it('BD_TIMEOUT when the delete transaction exceeds the statement timeout', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 104, featureCount: 1 });
    const entityManager = await getEntityManager();
    const timeoutError = new QueryFailedError(
      'DELETE ...',
      [],
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
    );
    const spy = jest.spyOn(entityManager, 'transaction').mockRejectedValueOnce(timeoutError);

    try {
      await expect(BulkDeleterModule.processBulkDeletion(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'BD_TIMEOUT',
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('rolls back dataset status and soft-deletion when the delete transaction fails', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 105, featureCount: 1 });
    expect(dataset.status).toBe(IngestionStatus.PUBLISHED);

    const entityManager = await getEntityManager();
    const timeoutError = new QueryFailedError(
      'DELETE ...',
      [],
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
    );
    const spy = jest.spyOn(entityManager, 'transaction').mockRejectedValueOnce(timeoutError);

    try {
      await expect(BulkDeleterModule.processBulkDeletion(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'BD_TIMEOUT',
      });
    } finally {
      spy.mockRestore();
    }

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    // Not withDeleted: true — a default query excludes soft-deleted rows, so finding it here
    // proves deleted_at was actually cleared, not just that status was reverted.
    const reloaded = await repo.findOneBy({ id: dataset.id });
    expect(reloaded).not.toBeNull();
    expect(reloaded?.status).toBe(IngestionStatus.PUBLISHED);
    expect(reloaded?.deleted_at).toBeNull();
  });

  // This is the guard on ADR 0027. Stripping a jsonb key cannot be undone by anything but a
  // transaction rollback, so the strip has to live inside the purge transaction; move it up
  // into deleteDataset and a failed purge silently resurrects the dataset with every
  // entitlement to it irrecoverably gone. Only this test notices.
  it('restores entitlements when the delete transaction fails', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 109, featureCount: 1 });

    const entityManager = await getEntityManager();
    await entityManager.query(`INSERT INTO entitlements (id, data) VALUES ('everyone', $1), ('user1@example.com', $2)`, [
      JSON.stringify({ [dataset.slug]: ['download'] }),
      JSON.stringify({ [dataset.slug]: ['preview'] }),
    ]);

    const timeoutError = new QueryFailedError(
      'DELETE ...',
      [],
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
    );
    // Run the real transaction body — so the entitlement strip actually executes — then abort
    // it. Rejecting outright (as the test above does) would never reach the strip at all.
    const realTransaction = entityManager.transaction.bind(entityManager);
    const spy = jest.spyOn(entityManager, 'transaction').mockImplementationOnce((async (runInTransaction: any) =>
      realTransaction(async manager => {
        await runInTransaction(manager);
        throw timeoutError;
      })) as typeof entityManager.transaction);

    try {
      await expect(BulkDeleterModule.processBulkDeletion(getJob(dataset.slug))).rejects.toMatchObject({
        name: 'JobError',
        code: 'BD_TIMEOUT',
      });
    } finally {
      spy.mockRestore();
    }

    const rows: Array<{ id: string; data: Record<string, string[]> }> = await entityManager.query(
      `SELECT id, data FROM entitlements ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 'everyone', data: { [dataset.slug]: ['download'] } },
      { id: 'user1@example.com', data: { [dataset.slug]: ['preview'] } },
    ]);
  });
});
