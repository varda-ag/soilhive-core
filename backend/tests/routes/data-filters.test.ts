import request from 'supertest';
import { app } from '../../src/app';
import { getSuperAdminToken } from '../helper';
import { IncomingHttpHeaders } from 'http';
import { getDataSource } from '../../src/utils/data-source';

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
    expect(res.statusCode).toBe(201);
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
    const id = resWrite.body.id;
    const resReadWithToken = await request(app).get(`/data-filters/${id}`).set(superAdminAuthHeader);
    expect(resReadWithToken.statusCode).toBe(200);
    expect(resReadWithToken.body.id).toBe(id);
    const resReadWithoutToken = await request(app).get(`/data-filters/${id}`);
    expect(resReadWithoutToken.statusCode).toBe(200);
    expect(resReadWithoutToken.body.id).toBe(id);
  });

  it('Getting a single filter with the wrong ID should return 404', async () => {
    const res = await request(app).get(`/data-filters/078983f9-0d92-46bb-9e7f-70f93b4a94b0`);
    expect(res.statusCode).toBe(404);
  });
});
