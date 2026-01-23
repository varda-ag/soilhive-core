import request from 'supertest';
import { app } from '../../src/app';
import { getSuperAdminToken } from '../helper';
import { IncomingHttpHeaders } from 'http';
import { getDataSource } from '../../src/utils/data-source';
import { TokenScopes } from '../../src/types/enums';

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
    const repo = dataSource.getRepository('JsonStorage');
    const row = await repo.findOneBy({ id: `filter_${TokenScopes.SUPER_ADMIN}` });
    expect(row).toBeTruthy();
  });

  it('Filter should be stored in DB only once if parameters are the same', async () => {
    const payload = {
      parameters: {},
      geometries: [filteringPolygon],
    };
    await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
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
    const res = await request(app).post('/data-filters').set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(400);
  });
});
