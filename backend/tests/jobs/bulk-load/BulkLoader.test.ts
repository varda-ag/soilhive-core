import { signToken } from '../../../src/utils/utils';
import { ErrorResponse } from '../../../src/utils/error';
import { Job } from 'pg-boss';
import request from 'supertest';
import { validate } from 'uuid';
import { app } from '../../../src/app';
import DatasetEntity from '../../../src/entities/Dataset';
import FeatureEntity from '../../../src/entities/Feature';
import { BulkLoadJob } from '../../../src/interfaces/Job';
import * as BulkLoaderModule from '../../../src/jobs/bulk-load/BulkLoader';
import { updateDatasetMetadata } from '../../../src/jobs/bulk-load/UpdateDatasetMetadata';
import { IngestionStatus } from '../../../src/types/data';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import {
  addSyntheticData,
  addSyntheticIngestionData,
  getLoadedDataCount,
  syntheticDataOptions,
  syntheticIngestionDataOptions,
} from '../../../src/utils/mock';
import { getRawTableName } from '../../../src/utils/utils';

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

    const { dataset, file } = await addSyntheticIngestionData({ ...options });

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

    const queryRunner = dataSource.createQueryRunner();
    const rawTableName = getRawTableName(file.id);
    const rawTableExists = await queryRunner.hasTable(rawTableName);
    expect(rawTableExists).toBeFalsy();

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

  it('updateDatasetMetadata sets data correctly', async () => {
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 1,
      soilPropertyNames: ['a', 'b'],
      depthLayers: 10,
      featureCount: 100,
    });

    const entityManager = await getEntityManager();
    await updateDatasetMetadata(entityManager, dataset.id, IngestionStatus.RELEASED);

    const datasetEntity = await entityManager.getRepository(DatasetEntity).findOneBy({ id: dataset.id });
    expect(datasetEntity).toBeDefined();
    expect(datasetEntity!.status).toBe(IngestionStatus.RELEASED);
    expect(datasetEntity!.soil_depth!).toEqual({ min: 0, max: 100 });
    expect(datasetEntity!.licenses).toEqual(['test_license_1']);
    expect(datasetEntity!.reference_period_start).toEqual('2021-01-01');
    expect(datasetEntity!.reference_period_stop).toEqual('2021-01-01');
    const isValidUUID1 = validate(datasetEntity!.measured_properties![0].soil_property_id);
    const isValidUUID2 = validate(datasetEntity!.measured_properties![0].procedure_id);
    expect(isValidUUID1).toBeFalsy();
    expect(isValidUUID2).toBeFalsy();

    const features = await entityManager.getRepository(FeatureEntity).find();
    const x = features.map(f => f.geom.coordinates[0]);
    const y = features.map(f => f.geom.coordinates[1]);
    const minX = x.reduce((min, current) => (current < min ? current : min), x[0]);
    const minY = y.reduce((min, current) => (current < min ? current : min), y[0]);
    expect(datasetEntity!.spatial_extent?.coordinates[0][0][0]).toBe(minX);
    expect(datasetEntity!.spatial_extent?.coordinates[0][0][1]).toBe(minY);
  });
});
