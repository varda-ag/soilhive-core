import { IncomingHttpHeaders } from 'http';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getSuperAdminToken } from '../helper';

describe('Testing /soil-data routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;

  beforeAll(async () => {
    // Get super admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it('Getting soil data without required parameter should fail', async () => {
    const res = await request(app).get(`/soil-data`);
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("must have required property 'datasets'");
  });

  it('Getting soil data where there is none should return empty results', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100 });
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('Validation of cursor parameter is working', async () => {
    const res = await request(app).get(`/soil-data`).query({ datasets: 'dataset1', limit: 100, cursor: 'invalid-cursor' });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('must match format "uuid"');
  });

  it('Should retrieve data when searching inside spatial extent', async () => {
    // Create synthetic data in bbox [0,0,10,10]
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1001,
      soilPropertyNames: ['ph_test'],
      featureCount: 5,
    });

    // Create a data filter with geometry inside the extent [0,0,10,10]
    const filterPayload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').set(superAdminAuthHeader).send(filterPayload);
    expect(filterRes.statusCode).toBe(201);
    const filterId = filterRes.body.id;

    // Call soil-data endpoint
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100`);
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data
  });

  it('Should return zero data when searching outside spatial extent', async () => {
    // Create synthetic data in bbox [0,0,10,10]
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1002,
      soilPropertyNames: ['oc_test'],
      featureCount: 5,
    });

    // Create a data filter with geometry outside the extent [20,20,30,30]
    const filterPayload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [20, 20],
              [30, 20],
              [30, 30],
              [20, 30],
              [20, 20],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').set(superAdminAuthHeader).send(filterPayload);
    expect(filterRes.statusCode).toBe(201);
    const filterId = filterRes.body.id;

    // Call soil-data endpoint
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100`);
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBe(0); // Should have no data
  });

  it('Should retrieve data from multiple geometries', async () => {
    // Create synthetic data in two separate areas
    const data1 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 5, 5],
      id: 1003,
      soilPropertyNames: ['multi1'],
      featureCount: 3,
    });
    const data2 = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [10, 10, 15, 15],
      id: 1004,
      soilPropertyNames: ['multi2'],
      featureCount: 3,
    });

    // Create a data filter with geometries covering both areas
    const filterPayload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [4, 1],
              [4, 4],
              [1, 4],
              [1, 1],
            ],
          ],
        },
        {
          type: 'Polygon',
          coordinates: [
            [
              [11, 11],
              [14, 11],
              [14, 14],
              [11, 14],
              [11, 11],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').set(superAdminAuthHeader).send(filterPayload);
    expect(filterRes.statusCode).toBe(201);
    const filterId = filterRes.body.id;

    // Call soil-data endpoint with both datasets
    const datasets = `${data1.dataset.slug},${data2.dataset.slug}`;
    const soilDataRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${datasets}&limit=100`);
    expect(soilDataRes.statusCode).toBe(200);
    expect(soilDataRes.body.length).toBeGreaterThan(0); // Should have data from both areas
  });

  it('Should sort data in ascending and descending order', async () => {
    // Create synthetic data
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [0, 0, 10, 10],
      id: 1005,
      soilPropertyNames: ['sort_test'],
      featureCount: 5,
    });

    // Create a data filter covering the entire extent
    const filterPayload = {
      parameters: {},
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        },
      ],
    };
    const filterRes = await request(app).post('/data-filters').set(superAdminAuthHeader).send(filterPayload);
    expect(filterRes.statusCode).toBe(201);
    const filterId = filterRes.body.id;

    // Get data sorted by value ascending
    const ascRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=value`);
    expect(ascRes.statusCode).toBe(200);
    expect(ascRes.body.length).toBeGreaterThan(1);

    // Get data sorted by value descending
    const descRes = await request(app).get(`/soil-data?filterId=${filterId}&datasets=${dataset.slug}&limit=100&sort=-value`);
    expect(descRes.statusCode).toBe(200);
    expect(descRes.body.length).toBe(ascRes.body.length);

    // Verify that the values are in reverse order
    const ascValues = ascRes.body.map((item: any) => item.value);
    const descValues = descRes.body.map((item: any) => item.value);
    expect(descValues).toEqual(ascValues.reverse());
  });
});
