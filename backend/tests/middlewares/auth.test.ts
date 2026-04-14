import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getEntityManager } from '../../src/utils/data-source';
import { StatusCodes } from 'http-status-codes';
import { getDataAdminToken, getSuperAdminToken } from '../helper';
import JobService from '../../src/services/JobService';
import EntitlementService from '../../src/services/EntitlementService';
import { EntityManager } from 'typeorm';

describe('authMiddleware', () => {
  let dataAdminToken: string;
  let superAdminToken: string;
  let entityManager: EntityManager;
  let getUserEntitlementsSpy: jest.SpiedFunction<typeof EntitlementService.prototype.getUserEntitlements>;
  const dataAdminEntitlements = { 'dataset-1': ['download', 'obfuscate_as_points', 'preview'] };
  const superAdminEntitlements = { 'dataset-1': ['download'], 'dataset-2': ['download'] };

  beforeAll(async () => {
    dataAdminToken = await getDataAdminToken();
    superAdminToken = await getSuperAdminToken();
    entityManager = await getEntityManager();
    getUserEntitlementsSpy = jest.spyOn(EntitlementService.prototype, 'getUserEntitlements');
    jest.spyOn(JobService.prototype, 'createJob').mockResolvedValue({
      id: 'test-job-id',
      queue: 'bulk-load',
      status: 'created',
      created_at: new Date(),
      completed_at: null,
      data: { type: 'bulk-load', dataset_id: 'test-dataset', created_by: null, progress_percentage: 0 },
    });
  });

  beforeEach(async () => {
    // Fill DB with test entitlements
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES
      ('everyone', '{"dataset-1": ["download"]}'),
      ('data-admin@localhost', '{"dataset-1": ["obfuscate_as_points", "preview", "download"]}'),
      ('super-admin@localhost', '{"dataset-2": ["download"]}')
    `);
    getUserEntitlementsSpy.mockClear();
  });

  afterAll(() => {
    getUserEntitlementsSpy.mockRestore();
  });

  describe('GET /datasets', () => {
    it('results in entitlementsRequired = false, sets empty entitlements without calling the service', async () => {
      const res = await request(app).get('/datasets');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual([]);
      expect(getUserEntitlementsSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /soil-data', () => {
    it('results in entitlementsRequired = false if called without a token', async () => {
      const res = await request(app).get('/soil-data').query({ datasets: 'test-dataset', limit: 10 });
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(getUserEntitlementsSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['data', dataAdminEntitlements],
      ['super', superAdminEntitlements],
    ])(
      'results in entitlementsRequired = true if called with a token, fetches and stores user entitlements',
      async (token, entitlements) => {
        const res = await request(app)
          .get('/soil-data')
          .set('Authorization', `Bearer ${token === 'data' ? dataAdminToken : superAdminToken}`)
          .query({ datasets: 'test-dataset', limit: 10 });
        expect(res.statusCode).toBe(StatusCodes.OK);
        expect(getUserEntitlementsSpy).toHaveBeenCalled();
        await expect(getUserEntitlementsSpy.mock.results[0]!.value).resolves.toEqual(entitlements);
      },
    );
  });

  describe('POST /jobs', () => {
    it('results in entitlementsRequired = true, fetches and stores user entitlements', async () => {
      const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${dataAdminToken}`)
        .send({ type: 'bulk-load', dataset_id: 'test-dataset' });
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(getUserEntitlementsSpy).toHaveBeenCalled();
    });
  });
});
