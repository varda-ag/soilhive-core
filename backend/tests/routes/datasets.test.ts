import request from 'supertest';
import { app } from '../../src/app';
import { getSuperAdminToken } from '../helper';
import { IncomingHttpHeaders } from 'http';
import { getDataSource } from '../../src/utils/data-source';
import { TokenScopes } from '../../src/types/enums';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';

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

describe('Testing /datasets-filters routes', () => {
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
    const res = await request(app).post('/datasets-filters').send(payload);
    expect(res.statusCode).toBe(expectedStatus);
  });

  it('Filter should be stored in DB', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    const res = await request(app).post('/datasets-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(201);
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository('JsonStorage');
    const row = await repo.findOneBy({ id: `filter_${TokenScopes.SUPER_ADMIN}` });
    expect(row).toBeTruthy();
  });

  it('Filter should be stored in DB only once if parameters are the same', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    await request(app).post('/datasets-filters').set(superAdminAuthHeader).send(payload);
    await request(app).post('/datasets-filters').set(superAdminAuthHeader).send(payload);
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository('JsonStorage');
    const rows = await repo.findBy({ id: `filter_${TokenScopes.SUPER_ADMIN}` });
    expect(rows.length).toEqual(1);
    expect(Object.keys(rows[0].data).length).toEqual(1);
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
    const res = await request(app).post('/datasets-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(400);
  });

  it('GET /datasets responds with the list of all available datasets', async () => {
    const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
    const s2 = await addSyntheticData({ ...syntheticDataOptions, id: 2, soilPropertyNames: ['oc'] });
    const res = await request(app).get('/datasets');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const ids = res.body.map((item: any) => item.id);
    expect(ids).toContain(s1.dataset.id);
    expect(ids).toContain(s2.dataset.id);
  });

  it('GET /datasets/:datasetSlug responds with the expected dataset', async () => {
    const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
    const res = await request(app).get(`/datasets/${s1.dataset.slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('slug', s1.dataset.slug);
  });

  it('GET /datasets responds with 404 if dataset does not exist', async () => {
    const res = await request(app).get(`/datasets/wrong`);
    expect(res.statusCode).toBe(404);
  });
});
