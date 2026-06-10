import { describe, it, expect, jest } from '@jest/globals';
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
import { StatusCodes } from 'http-status-codes';
import { INTERNAL_REQUEST_TOKEN_PAYLOAD } from '../../../src/constants/constants';

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
      isDataAdmin: true,
      isSuperAdmin: false,
    },
    heartbeatSeconds: 10,
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
    const token = signToken(INTERNAL_REQUEST_TOKEN_PAYLOAD);

    const mockMakeRequest = jest
      .spyOn(BulkLoaderModule, 'makeRequest')
      .mockImplementation(async (datasetSlug: string, datasetFileMappingId: string, payload: any) => {
        const response = await request(app)
          .post(`/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload);
        expect(response.statusCode).toBe(StatusCodes.CREATED);
        return response;
      });

    await BulkLoaderModule.processBulkLoad(getJob(dataset.slug));

    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(2);
    expect(createdData.n_layers).toBe(18);
    expect(createdData.n_dataset_layers).toBe(23);
    expect(createdData.n_observations).toBe(25);

    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(DatasetEntity);
    const datasets = await repo.find();
    expect(datasets.length).toBe(1);
    expect(datasets[0].status).toBe(IngestionStatus.LOADED);

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
      featureCount: 10,
    });

    const entityManager = await getEntityManager();
    await updateDatasetMetadata(entityManager, dataset.id, IngestionStatus.PUBLISHED);

    const datasetEntity = await entityManager.getRepository(DatasetEntity).findOneBy({ id: dataset.id });
    expect(datasetEntity).toBeDefined();
    expect(datasetEntity!.status).toBe(IngestionStatus.PUBLISHED);
    expect(datasetEntity!.soil_depth!).toEqual({ min: 0, max: 100 });
    expect(datasetEntity!.licenses).toEqual(['test_license_1']);
    expect(datasetEntity!.reference_period_start).toEqual('2021-01-01');
    expect(datasetEntity!.reference_period_stop).toEqual('2021-01-01');
    expect(datasetEntity!.inferred_properties?.sort()).toEqual(
      [
        'gis_datatype',
        'licenses',
        'measured_properties',
        'n_observations',
        'reference_period_start',
        'reference_period_stop',
        'soil_depth',
        'spatial_extent',
      ].sort(),
    );
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
