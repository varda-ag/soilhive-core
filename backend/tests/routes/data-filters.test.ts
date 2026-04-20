import { describe, it, expect, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import request from 'supertest';
import { app } from '../../src/app';
import { FilteredDatasetSummary, FilteredData, FilteredDataset } from '../../src/interfaces/DatasetFilter';
import { getDataSource } from '../../src/utils/data-source';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataAdminToken, getSuperAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';

const filteringPolygon = {
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
  type: 'Polygon',
};

describe('Testing /data-filters routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    // Get super admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it.each([
    ['Point', [0, 0], 400],
    [
      'Polygon',
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      201,
    ],
    [
      'MultiPolygon',
      [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      ],
      201,
    ],
  ])('Tests filter geometry type validation', async (type, coordinates, expectedStatus) => {
    const payload = {
      parameters: {},
      geometries: [{ coordinates, type }],
    };
    const res = await request(app).post('/data-filters').send(payload);
    expect(res.statusCode).toBe(expectedStatus);
  });

  it('Filter should be stored in DB', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    const res = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(StatusCodes.CREATED);
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository('DataFilterEntity');
    const row = await repo.findOneBy({ id: res.body.id });
    expect(row).toBeTruthy();
  });

  it('Filter should be stored in DB twice even if parameters are the same', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    const res1 = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    const res2 = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository('DataFilterEntity');
    const row1 = await repo.findBy({ id: res1.body.id });
    const row2 = await repo.findBy({ id: res2.body.id });
    expect(row1.length).toEqual(1);
    expect(row2.length).toEqual(1);
    expect(row1[0].filter).toEqual(row2[0].filter);
  });

  it('Invalid geometry should return 400', async () => {
    const payload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              // Missing closing coordinate
            ],
          ],
        },
      ],
    };
    const res = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(400);
  });

  it('Cannot get owned filters without a token', async () => {
    const res = await request(app).get('/data-filters');
    expect(res.statusCode).toBe(401);
  });

  it('Getting all owned filters', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    const count = 3;
    for (let i = 0; i < count; i++) {
      await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    }
    const res = await request(app).get('/data-filters').set(superAdminAuthHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(count);
  });

  it('Getting a single filter with and without a token should return expected data', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    const resWrite = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(resWrite.statusCode).toBe(StatusCodes.CREATED);
    const id = resWrite.body.id;
    const resReadWithToken = await request(app).get(`/data-filters/${id}`).set(superAdminAuthHeader);
    expect(resReadWithToken.statusCode).toBe(StatusCodes.OK);
    expect(resReadWithToken.body.id).toBe(id);
    const resReadWithoutToken = await request(app).get(`/data-filters/${id}`);
    expect(resReadWithoutToken.statusCode).toBe(StatusCodes.OK);
    expect(resReadWithoutToken.body.id).toBe(id);
  });

  it('Getting a single filter with the wrong ID should return 404', async () => {
    const res = await request(app).get(`/data-filters/078983f9-0d92-46bb-9e7f-70f93b4a94b0`);
    expect(res.statusCode).toBe(404);
  });

  it('Coverage should return some results', async () => {
    const layers = 5;
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, depthLayers: layers, soilPropertyNames: ['prop1', 'prop2'] });
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    // Create filter
    const resPost = await request(app).post('/data-filters').send(payload);
    const id = resPost.body.id;
    // Get coverage
    const resCoverage = await request(app).get(`/data-filters/${id}/coverage`);
    const result: FilteredData = resCoverage.body;
    const resultDatasets: FilteredDatasetSummary[] = result.datasets;
    expect(resultDatasets.length).toBe(1);
    expect(resultDatasets[0].name).toBe(dataset.name);
    expect(resultDatasets[0].id).toBe(dataset.slug);
    expect(resultDatasets[0].dataset_layer_count).toBe(layers);
    expect(resultDatasets[0].soil_properties).toContain('prop1');
    expect(resultDatasets[0].soil_properties).toContain('prop2');
    expect(resultDatasets[0].licenses).toContain('test_license_1');
    const resultDatasetIds = resultDatasets.map(r => r.id);
    expect(resultDatasetIds).toContain(dataset.slug);
  });

  it('Coverage should not return data for a deleted dataset', async () => {
    // 1. Prepare a dataset with its observations
    const layers = 5;
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, depthLayers: layers, soilPropertyNames: ['prop1', 'prop2'] });

    // 2. Delete the dataset
    const token = await getDataAdminToken();
    await request(app).delete(`/datasets/${dataset.slug}`).set('Authorization', `Bearer ${token}`);

    // 3. Retrieve coverage
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    // Create filter
    const resPost = await request(app).post('/data-filters').send(payload);
    const id = resPost.body.id;
    // Get coverage
    const resCoverage = await request(app).get(`/data-filters/${id}/coverage`);
    const results: FilteredData = resCoverage.body;

    // No data is expected to be returned
    expect(results.datasets.length).toBe(0);
  });

  it('Datasets endpoint returns an array', async () => {
    const payload = { parameters: {}, geometries: [filteringPolygon] };
    const resPost = await request(app).post('/data-filters').send(payload);
    const resDatasets = await request(app).get(`/data-filters/${resPost.body.id}/datasets`);
    expect(resDatasets.statusCode).toBe(200);
    expect(Array.isArray(resDatasets.body)).toBe(true);
  });

  it('Datasets should return same datasets as coverage when filtering by geometry', async () => {
    for (let i = 0; i < 5; i++) {
      await addSyntheticData({ ...syntheticDataOptions, id: i, soilPropertyNames: [`${i}`] });
    }
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    // Create filter
    const resPost = await request(app).post('/data-filters').send(payload);
    const id = resPost.body.id;
    // Get datasets
    const resDatasets = await request(app).get(`/data-filters/${id}/datasets`);
    const resultDatasets: FilteredDataset[] = resDatasets.body;
    // Get coverage
    const resCoverage = await request(app).get(`/data-filters/${id}/coverage`);
    const resultCoverage: FilteredData = resCoverage.body;
    const coverageDatasets: FilteredDatasetSummary[] = resultCoverage.datasets;
    expect(resultDatasets.length).toBe(coverageDatasets.length);
    expect(resultDatasets.map(ds => ds.id).sort()).toEqual(coverageDatasets.map(ds => ds.id).sort());
    expect(resultDatasets.map(ds => ds.name).sort()).toEqual(coverageDatasets.map(ds => ds.name).sort());
    expect(resultDatasets.map(ds => ds.data_type).sort()).toEqual(coverageDatasets.map(ds => ds.data_type).sort());
  });

  it('Datasets should not include datasets outside the geometry', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 99, spatial_extent: [10, 10, 11, 11] });
    const payload = { parameters: {}, geometries: [filteringPolygon] };
    const resPost = await request(app).post('/data-filters').send(payload);
    const resDatasets = await request(app).get(`/data-filters/${resPost.body.id}/datasets`);
    expect(resDatasets.statusCode).toBe(StatusCodes.OK);
    const ids = (resDatasets.body as FilteredDataset[]).map(ds => ds.id);
    expect(ids).not.toContain(dataset.slug);
  });
});
