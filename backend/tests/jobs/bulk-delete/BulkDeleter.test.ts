import { describe, it, expect } from '@jest/globals';
import { Job } from 'pg-boss';
import DatasetEntity from '../../../src/entities/Dataset';
import { BulkDeleteJob } from '../../../src/interfaces/Job';
import * as BulkDeleterModule from '../../../src/jobs/bulk-delete/BulkDeleter';
import { IngestionStatus } from '../../../src/types/data';
import { getDataSource } from '../../../src/utils/data-source';
import { addSyntheticData, getLoadedDataCount, syntheticDataOptions } from '../../../src/utils/mock';

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
    },
  };
};

describe('BulkDeleter class', () => {
  it('Bulk deleting all synthetic data', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 101, featureCount: 2 });

    expect(dataset.status).toBe(IngestionStatus.LOADED);

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
