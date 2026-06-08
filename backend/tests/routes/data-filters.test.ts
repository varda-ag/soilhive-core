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

  it('Filter geometry should be stored in user_geometries with a join row', async () => {
    const payload = { parameters: {}, geometries: [filteringPolygon] };
    const res = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(StatusCodes.CREATED);

    const dataSource = await getDataSource();
    const joinRepo = dataSource.getRepository('DataFilterUserGeometryEntity');
    const geomRepo = dataSource.getRepository('UserGeometryEntity');

    const joinRows = await joinRepo.findBy({ data_filter_id: res.body.id });
    expect(joinRows.length).toBe(1);

    const userGeom = await geomRepo.findOneBy({ id: joinRows[0].user_geometry_id });
    expect(userGeom).toBeDefined();
    expect(userGeom!.geom).toBeTruthy();
  });

  it('Two filters with the same geometry share one user_geometries row', async () => {
    const payload = { parameters: {}, geometries: [filteringPolygon] };
    const res1 = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    const res2 = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);

    const dataSource = await getDataSource();
    const joinRepo = dataSource.getRepository('DataFilterUserGeometryEntity');

    const [join1] = await joinRepo.findBy({ data_filter_id: res1.body.id });
    const [join2] = await joinRepo.findBy({ data_filter_id: res2.body.id });

    expect(join1.user_geometry_id).toBe(join2.user_geometry_id);
  });

  it('Multiple geometries in a filter each get a user_geometries row and join entry', async () => {
    const secondPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 11],
          [10, 10],
        ],
      ],
    };
    const payload = { parameters: {}, geometries: [filteringPolygon, secondPolygon] };
    const res = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(StatusCodes.CREATED);

    const dataSource = await getDataSource();
    const joinRepo = dataSource.getRepository('DataFilterUserGeometryEntity');

    const joinRows = await joinRepo.findBy({ data_filter_id: res.body.id });
    expect(joinRows.length).toBe(2);

    const ids = joinRows.map((r: any) => r.user_geometry_id);
    expect(new Set(ids).size).toBe(2);
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
    expect(resultDatasets[0].visibility).toBe('public');
    const resultDatasetIds = resultDatasets.map(r => r.id);
    expect(resultDatasetIds).toContain(dataset.slug);
  });

  it('Coverage should reflect dataset visibility', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, depthLayers: 1 });
    // Flip to private directly via the datasets PATCH endpoint
    const token = await getDataAdminToken();
    await request(app).patch(`/datasets/${dataset.slug}`).set('Authorization', `Bearer ${token}`).send({ visibility: 'private' });

    const resPost = await request(app)
      .post('/data-filters')
      .send({ parameters: {}, geometries: [filteringPolygon] });
    const resCoverage = await request(app).get(`/data-filters/${resPost.body.id}/coverage`);
    const resultDatasets: FilteredDatasetSummary[] = resCoverage.body.datasets;

    expect(resultDatasets.length).toBe(1);
    expect(resultDatasets[0].id).toBe(dataset.slug);
    expect(resultDatasets[0].visibility).toBe('private');
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

  it('Coverage should return aggregated dataset summaries across multiple geometries', async () => {
    const leftPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0.5, 0],
          [0.5, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    const rightPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0.5, 0],
          [1, 0],
          [1, 1],
          [0.5, 1],
          [0.5, 0],
        ],
      ],
    };

    // One feature in each half, 3 depth layers each
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 20,
      featureCoordinates: [
        [0.25, 0.5],
        [0.75, 0.5],
      ],
      depthLayers: 3,
    });

    const payload = { parameters: {}, geometries: [leftPolygon, rightPolygon] };
    const resPost = await request(app).post('/data-filters').send(payload);
    const resCoverage = await request(app).get(`/data-filters/${resPost.body.id}/coverage`);
    const result: FilteredData = resCoverage.body;

    const matches = result.datasets.filter(ds => ds.id === dataset.slug);
    expect(matches.length).toBe(1);
    expect(matches[0].dataset_layer_count).toBe(6); // 3 layers per geometry, summed
  });

  it('geometryOnly=true returns more results than geometryOnly=false when a soil property filter is active', async () => {
    // Dataset A has 'ph', dataset B has 'organic_matter' — both within filteringPolygon
    await addSyntheticData({ ...syntheticDataOptions, id: 30, soilPropertyNames: ['ph'] });
    await addSyntheticData({ ...syntheticDataOptions, id: 31, soilPropertyNames: ['organic_matter'] });

    // Filter restricts to only 'ph' soil property
    const payload = {
      parameters: { soil_properties: ['ph'] },
      geometries: [filteringPolygon],
    };
    const resPost = await request(app).post('/data-filters').send(payload);
    const id = resPost.body.id;

    const resWithFilter = await request(app).get(`/data-filters/${id}/coverage`);
    const resGeometryOnly = await request(app).get(`/data-filters/${id}/coverage?geometryOnly=true`);

    expect(resWithFilter.statusCode).toBe(StatusCodes.OK);
    expect(resGeometryOnly.statusCode).toBe(StatusCodes.OK);

    const withFilter: FilteredData = resWithFilter.body;
    const geometryOnly: FilteredData = resGeometryOnly.body;

    // geometryOnly ignores the soil_properties parameter so it returns all datasets in the geometry
    expect(geometryOnly.datasets.length).toBeGreaterThan(withFilter.datasets.length);

    // The soil-property-filtered result should only include the 'ph' dataset
    const filteredIds = withFilter.datasets.map(ds => ds.id);
    expect(filteredIds.every(id => withFilter.datasets.find(ds => ds.id === id)?.soil_properties?.includes('ph'))).toBe(true);

    // The geometryOnly result should include both datasets
    const geometryOnlyIds = geometryOnly.datasets.map(ds => ds.id);
    const phDataset = geometryOnly.datasets.find(ds => ds.soil_properties?.includes('ph'));
    const omDataset = geometryOnly.datasets.find(ds => ds.soil_properties?.includes('organic_matter'));
    expect(phDataset).toBeDefined();
    expect(omDataset).toBeDefined();
    expect(geometryOnlyIds).toContain(phDataset!.id);
    expect(geometryOnlyIds).toContain(omDataset!.id);
  });

  it('Datasets endpoint returns an array', async () => {
    const payload = { parameters: {}, geometries: [filteringPolygon] };
    const resPost = await request(app).post('/data-filters').send(payload);
    const resDatasets = await request(app).get(`/data-filters/${resPost.body.id}/datasets`);
    expect(resDatasets.statusCode).toBe(200);
    expect(Array.isArray(resDatasets.body)).toBe(true);
  });

  it('Datasets should return same datasets as coverage', async () => {
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
