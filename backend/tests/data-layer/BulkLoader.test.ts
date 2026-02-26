import { addSyntheticIngestionData, syntheticIngestionDataOptions, getLoadedDataCount } from '../../src/utils/mock';
import * as BulkLoaderModule from '../../src/jobs/bulk-load/BulkLoader';
import { BulkLoadJob } from '../../src/interfaces/Job';
import request from 'supertest';
import { app } from '../../src/app';
import DatasetEntity from '../../src/entities/Dataset';
import { getDataSource } from '../../src/utils/data-source';
import { IngestionStatus } from '../../src/types/data';
import { Job } from 'pg-boss';
import { signToken } from '../../src/utils/utils';
import { ErrorResponse } from '../../src/utils/error';

const getJob = (dataset_id: string): Job<BulkLoadJob> => {
  return {
    id: 'mock-id',
    name: 'mock-job',
    expireInSeconds: 60,
    signal: AbortSignal.timeout(10000),
    data: {
      type: 'bulk-load',
      created_by: 'test-user',
      progress_percentage: 0,
      dataset_id,
    },
  };
};

describe('BulkLoader class', () => {
  it('Bulk loading synthetic data', async () => {
    // Clone options and remove filters
    const options = JSON.parse(JSON.stringify(syntheticIngestionDataOptions));
    delete options.columnMapping.bdfi33.max_val;
    delete options.columnMapping.bdfiod.min_val;
    delete options.columnMapping.drop_records;

    const { dataset } = await addSyntheticIngestionData({ ...options });

    expect(dataset.status).toBe(IngestionStatus.PENDING);
    const token = signToken('internal-request');

    const mockMakeRequest = jest
      .spyOn(BulkLoaderModule, 'makeRequest')
      .mockImplementation(async (datasetSlug: string, datasetFileMappingId: string, payload: any) => {
        const response = await request(app)
          .post(`/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload);
        return response;
      });

    await BulkLoaderModule.processBulkLoad(getJob(dataset.slug));

    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(2);
    expect(createdData.n_layers).toBe(17);
    expect(createdData.n_dataset_layers).toBe(20);
    expect(createdData.n_observations).toBe(22);

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    const datasets = await repo.find();
    expect(datasets.length).toBe(1);
    expect(datasets[0].status).toBe(IngestionStatus.INGESTED);

    mockMakeRequest.mockRestore();
  });

  it('Bulk loading treats POST /soil-data error properly', async () => {
    const { dataset } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });

    const token = signToken('failing-token');

    const mockMakeRequest = jest
      .spyOn(BulkLoaderModule, 'makeRequest')
      .mockImplementation(async (datasetSlug: string, datasetFileMappingId: string, payload: any) => {
        const response = await request(app)
          .post(`/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload);
        if (response.statusCode !== 201) {
          throw new ErrorResponse(`Failed to load data`, response.statusCode);
        }
        return response;
      });

    await expect(BulkLoaderModule.processBulkLoad(getJob(dataset.slug))).rejects.toThrow();

    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(0);
    expect(createdData.n_layers).toBe(0);
    expect(createdData.n_dataset_layers).toBe(0);
    expect(createdData.n_observations).toBe(0);

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    const datasets = await repo.find();
    expect(datasets.length).toBe(1);
    expect(datasets[0].status).toBe(IngestionStatus.PENDING);

    mockMakeRequest.mockRestore();
  });
});
