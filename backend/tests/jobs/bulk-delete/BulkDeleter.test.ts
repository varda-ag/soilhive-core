import { describe, it, expect, jest } from '@jest/globals';
import path from 'path';
import { Job } from 'pg-boss';
import { QueryFailedError } from 'typeorm';
import DatasetEntity from '../../../src/entities/Dataset';
import { BulkDeleteJob } from '../../../src/interfaces/Job';
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
});
