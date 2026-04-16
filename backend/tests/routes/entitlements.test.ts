import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { app } from '../../src/app';
import EntitlementService from '../../src/services/EntitlementService';
import { Capability } from '../../src/types/enums';
import { getEntityManager } from '../../src/utils/data-source';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataAdminToken } from '../helper';

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

    it('updates capabilities for a dataset and reflects them in GET /datasets/:datasetId', async () => {
      const initialRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${token}`);
      expect(initialRes.statusCode).toBe(StatusCodes.OK);
      expect(initialRes.body.capabilities).toEqual([Capability.DOWNLOAD, Capability.PREVIEW]); // "everyone" + "${email}" entitlements

      const newEntitlements = { [email]: [Capability.OBFUSCATE_AS_POINTS] };
      const putRes = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`).send(newEntitlements);
      expect(putRes.statusCode).toBe(StatusCodes.OK);

      const updatedRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${token}`);
      expect(updatedRes.statusCode).toBe(StatusCodes.OK);
      expect(updatedRes.body.capabilities).toEqual([Capability.OBFUSCATE_AS_POINTS]); // Updated entitlements should be reflected in dataset capabilities
    });
  });

  describe('Getting entitlements from external provider successfully', () => {
    it('merges local and remote entitlements', async () => {
      process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

      const expectedEntitlements = {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-2': [Capability.PREVIEW],
        test_dataset_1: [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW, Capability.DOWNLOAD],
      };

      // Mock callEntitlementsEndpoint function
      const remoteEntitlements = {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-2': [Capability.PREVIEW],
        test_dataset_1: [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW],
      };

      const callEntitlementsEndpointSpy = jest
        .spyOn(EntitlementService.prototype, 'callEntitlementsEndpoint')
        .mockResolvedValue(remoteEntitlements);

      const res = await request(app).get('/entitlements').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual(expectedEntitlements);

      // Clean up
      delete process.env.ENTITLEMENTS_ENDPOINT;
      callEntitlementsEndpointSpy.mockRestore();
    });
  });

  it('responds with an error', async () => {
    process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

    const detail = 'Failed to fetch entitlements from endpoint: message';
    const callEntitlementsEndpointSpy = jest
      .spyOn(EntitlementService.prototype, 'callEntitlementsEndpoint')
      .mockRejectedValue(new Error(detail));

    const res = await request(app).get(`/entitlements`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.body).toHaveProperty('detail', detail);

    // Clean up
    delete process.env.ENTITLEMENTS_ENDPOINT;
    callEntitlementsEndpointSpy.mockRestore();
  });
});
