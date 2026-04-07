import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import request from 'supertest';
import { app } from '../../src/app';
import { StatusCodes } from 'http-status-codes';
import { getDataAdminToken } from '../helper';
import { getEntityManager } from '../../src/utils/data-source';
import * as entitlementsController from '../../src/controllers/entitlements';

describe('Testing entitlements routes', () => {
  const slug = 'test_dataset_1';
  const email = 'data-admin@localhost';
  let token: string;

  beforeAll(async () => {
    token = await getDataAdminToken();
  });

  beforeEach(async () => {
    await addSyntheticData({ ...syntheticDataOptions, id: 1 });
    const entityManager = await getEntityManager();
    await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES
        ('everyone', '{"${slug}": ["download"]}'),
        ('${email}', '{"${slug}": ["preview"]}')
        `);
  });

  describe('GET /datasets/{datasetId}/entitlements', () => {
    it('responds with the list of entitlements', async () => {
      const res = await request(app).get(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({
        everyone: ['download'],
        [email]: ['preview'],
      });
    });
  });

  describe('PUT /datasets/{datasetId}/entitlements', () => {
    it.each([{}, { everyone: ['download'], [email]: ['preview'] }, { everyone: ['download'], [email]: ['read'] }])(
      'changes the dataset entitlements',
      async payload => {
        const putRes = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`).send(payload);
        expect(putRes.statusCode).toBe(StatusCodes.OK);
        const res = await request(app).get(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`);
        expect(res.body).toEqual(payload);
      },
    );
  });

  describe('Getting entitlements from external provider successfully', () => {
    it('responds with the list of entitlements', async () => {
      process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

      // Mock callEntitlementsEndpoint function
      const entitlementsResponse = {
        'dataset-1': ['download'],
        'dataset-2': ['preview'],
      };

      const callEntitlementsEndpointSpy = jest
        .spyOn(entitlementsController, 'callEntitlementsEndpoint')
        .mockImplementation(async (req: Request, res: Response) => {
          res.json(entitlementsResponse);
        });

      const res = await request(app).get(`/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual(entitlementsResponse);

      // Clean up
      delete process.env.ENTITLEMENTS_ENDPOINT;
      callEntitlementsEndpointSpy.mockRestore();
    });
  });

  it('responds with an error', async () => {
    process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

    const message = 'Failed to fetch entitlements from endpoint: message';
    const callEntitlementsEndpointSpy = jest
      .spyOn(entitlementsController, 'callEntitlementsEndpoint')
      .mockImplementation(async (_req: Request, res: Response) => {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).type('application/problem+json').json({ message });
      });

    const res = await request(app).get(`/entitlements`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({ message });

    // Clean up
    delete process.env.ENTITLEMENTS_ENDPOINT;
    callEntitlementsEndpointSpy.mockRestore();
  });
});
