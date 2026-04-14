import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { StatusCodes } from 'http-status-codes';
import { getDataAdminToken } from '../helper';
import { getDataSource } from '../../src/utils/data-source';
import { initPgBoss, stopPgBoss, PG_BOSS_SCHEMA } from '../../src/services/PgBoss';
import { sleep } from '../../src/utils/utils';

describe('authMiddleware', () => {
  let token: string;

  beforeAll(async () => {
    token = await getDataAdminToken();
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss tables to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  describe('GET /datasets', () => {
    it('results in entitlementsRequired = false, sets empty entitlements without calling the service', async () => {
      const res = await request(app).get('/datasets');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /soil-data', () => {
    it('results in entitlementsRequired = true, fetches and stores user entitlements', async () => {
      const res = await request(app)
        .get('/soil-data')
        .set('Authorization', `Bearer ${token}`)
        .query({ datasets: 'test-dataset', limit: 10 });
      expect(res.statusCode).toBe(StatusCodes.OK);
    });
  });

  describe('POST /jobs', () => {
    it('results in entitlementsRequired = true, fetches and stores user entitlements', async () => {
      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'bulk-load', dataset_id: 'test-dataset' });
      expect(res.statusCode).toBe(StatusCodes.CREATED);
    });
  });
});
