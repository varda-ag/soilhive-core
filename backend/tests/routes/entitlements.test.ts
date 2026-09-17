import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { app } from '../../src/app';
import EntitlementService from '../../src/services/EntitlementService';
import { Capability } from '../../src/types/enums';
import { getEntityManager } from '../../src/utils/data-source';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataAdminToken, getUserToken } from '../helper';
import DatasetService from '../../src/services/DatasetService';
import { Token } from '../../src/interfaces/Token';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

describe('Testing entitlements routes', () => {
  const slug = 'test_dataset_1';
  const userEmail = 'data-admin@localhost';
  let token: string;

  beforeAll(async () => {
    token = await getDataAdminToken();
  });

  beforeEach(async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 1 });
    const entityManager = await getEntityManager();
    const datasetService = new DatasetService();
    // Update dataset to "private" visibility to test entitlements
    const requestData = {
      entityManager,
      token: mockToken,
      entitlements: {},
    };
    await datasetService.updateDataset(requestData, dataset.slug, { visibility: 'private' });
    // Setup test entitlements, nested under "datasets" (see ADR-0032)
    await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES
        ('everyone', '{"datasets": {"${slug}": ["download"]}}'),
        ('${userEmail}', '{"datasets": {"${slug}": ["preview"]}}')
        `);
  });

  describe('GET /datasets/{datasetId}/entitlements', () => {
    it('responds with the list of entitlements', async () => {
      const res = await request(app).get(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({
        everyone: ['download'],
        [userEmail]: ['preview'],
      });
    });
  });

  describe('PUT /datasets/{datasetId}/entitlements', () => {
    it.each([{}, { everyone: ['download'], [userEmail]: ['preview'] }, { everyone: ['download'], [userEmail]: ['read'] }])(
      'changes the dataset entitlements',
      async payload => {
        const putRes = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`).send(payload);
        expect(putRes.statusCode).toBe(StatusCodes.OK);
        const res = await request(app).get(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`);
        expect(res.body).toEqual(payload);
      },
    );

    it('updates capabilities for a dataset and reflects them in GET /datasets/:datasetId', async () => {
      // A non-admin token: an admin/data-admin token bypasses entitlements outright on
      // GET /datasets/:datasetId (see getCapabilities), so it would pass this test vacuously —
      // same reasoning as getUserToken's own doc comment.
      const subjectEmail = 'entitled-subject@example.com';
      const subjectToken = getUserToken('entitled-subject-id', subjectEmail);

      const initialRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${subjectToken}`);
      expect(initialRes.statusCode).toBe(StatusCodes.OK);
      expect(initialRes.body.capabilities).toEqual([Capability.DOWNLOAD]); // "everyone" entitlement only, seeded in beforeEach

      const newEntitlements = { everyone: [Capability.DOWNLOAD], [subjectEmail]: [Capability.OBFUSCATE_AS_POINTS] };
      const putRes = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`).send(newEntitlements);
      expect(putRes.statusCode).toBe(StatusCodes.OK);

      const updatedRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${subjectToken}`);
      expect(updatedRes.statusCode).toBe(StatusCodes.OK);
      // Updated entitlements should be reflected in dataset capabilities: "everyone" + this subject's own grant
      expect(updatedRes.body.capabilities).toEqual([Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS]);
    });
  });

  describe('GET /config/{configId}/entitlements', () => {
    const configId = 'test_config_1';

    beforeEach(async () => {
      const entityManager = await getEntityManager();
      await entityManager.query(`
        UPDATE entitlements SET data = data || jsonb_build_object('configs', jsonb_build_object('${configId}', '["download"]'::jsonb))
        WHERE id = 'everyone'
      `);
    });

    it('responds with the list of entitlements', async () => {
      const res = await request(app).get(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ everyone: ['download'] });
    });

    it('rejects a non-admin caller with no READ/WRITE capability for the config', async () => {
      const nonAdminToken = getUserToken('reader-id', 'reader@example.com');

      const res = await request(app).get(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${nonAdminToken}`);

      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('allows a non-admin caller holding READ for the config', async () => {
      const readerEmail = 'reader-with-read@example.com';
      await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ everyone: ['download'], [readerEmail]: ['read'] });
      const readerToken = getUserToken('reader-with-read-id', readerEmail);

      const res = await request(app).get(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${readerToken}`);

      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ everyone: ['download'], [readerEmail]: ['read'] });
    });

    it('allows a non-admin caller holding WRITE for the config', async () => {
      const writerEmail = 'reader-with-write@example.com';
      await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ everyone: ['download'], [writerEmail]: ['write'] });
      const writerToken = getUserToken('reader-with-write-id', writerEmail);

      const res = await request(app).get(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${writerToken}`);

      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ everyone: ['download'], [writerEmail]: ['write'] });
    });

    it('returns 401 with no token', async () => {
      const res = await request(app).get(`/config/${configId}/entitlements`);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('PUT /config/{configId}/entitlements', () => {
    const configId = 'test_config_1';

    it.each([{}, { everyone: ['download'], [userEmail]: ['preview'] }, { everyone: ['download'], [userEmail]: ['read'] }])(
      'changes the config entitlements',
      async payload => {
        const putRes = await request(app).put(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${token}`).send(payload);
        expect(putRes.statusCode).toBe(StatusCodes.OK);
        const res = await request(app).get(`/config/${configId}/entitlements`).set('Authorization', `Bearer ${token}`);
        expect(res.body).toEqual(payload);
      },
    );

    it('allows a non-admin caller to PUT on first access (nobody holds a grant for the config yet)', async () => {
      const firstAccessToken = getUserToken('first-access-id', 'first-access@example.com');

      const res = await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${firstAccessToken}`)
        .send({ 'first-access@example.com': [Capability.WRITE] });

      expect(res.statusCode).toBe(StatusCodes.OK);
    });

    it('rejects a non-admin caller lacking WRITE once the config already has grants', async () => {
      await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [userEmail]: [Capability.READ] });
      const noWriteToken = getUserToken('no-write-id', 'no-write@example.com');

      const res = await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${noWriteToken}`)
        .send({ 'no-write@example.com': [Capability.READ] });

      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('allows a non-admin caller holding WRITE on the config even though grants already exist', async () => {
      const writeHolderEmail = 'write-holder@example.com';
      await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [writeHolderEmail]: [Capability.WRITE] });
      const writeHolderToken = getUserToken('write-holder-id', writeHolderEmail);

      const res = await request(app)
        .put(`/config/${configId}/entitlements`)
        .set('Authorization', `Bearer ${writeHolderToken}`)
        .send({ [writeHolderEmail]: [Capability.WRITE], [userEmail]: [Capability.READ] });

      expect(res.statusCode).toBe(StatusCodes.OK);
    });

    it('rejects a non-admin caller on a reserved config key, even on first access', async () => {
      const nonAdminToken = getUserToken('reserved-key-id', 'reserved-key@example.com');

      const res = await request(app)
        .put(`/config/theme/entitlements`)
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({ 'reserved-key@example.com': [Capability.WRITE] });

      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('rejects an admin caller on a reserved config key too', async () => {
      const res = await request(app)
        .put(`/config/theme/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [userEmail]: [Capability.WRITE] });

      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('returns 401 with no token', async () => {
      const res = await request(app).put(`/config/${configId}/entitlements`).send({});
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('Scope isolation between datasets and configs', () => {
    it('does not leak PUT /config/{id}/entitlements into GET /datasets/{id}/entitlements, or vice versa, for a colliding id', async () => {
      // Reuses the dataset slug seeded in the top-level beforeEach as the config id
      const collisionId = slug;
      const configPayload = { everyone: ['preview'] };

      const putConfigRes = await request(app)
        .put(`/config/${collisionId}/entitlements`)
        .set('Authorization', `Bearer ${token}`)
        .send(configPayload);
      expect(putConfigRes.statusCode).toBe(StatusCodes.OK);

      // The dataset's own entitlements, seeded in the top-level beforeEach, must be unaffected
      const datasetRes = await request(app).get(`/datasets/${collisionId}/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(datasetRes.statusCode).toBe(StatusCodes.OK);
      expect(datasetRes.body).toEqual({ everyone: ['download'], [userEmail]: ['preview'] });

      // And the config entitlements must be exactly what was PUT, not merged with the dataset's
      const configRes = await request(app).get(`/config/${collisionId}/entitlements`).set('Authorization', `Bearer ${token}`);
      expect(configRes.statusCode).toBe(StatusCodes.OK);
      expect(configRes.body).toEqual(configPayload);
    });
  });

  describe('Getting entitlements from external provider successfully', () => {
    it('merges local and remote entitlements, sliced to the requested scope', async () => {
      process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

      const expectedEntitlements = {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-2': [Capability.PREVIEW],
        test_dataset_1: [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW],
      };

      // Mock callEntitlementsEndpoint function
      const remoteEntitlements = {
        'dataset-1': [Capability.DOWNLOAD],
        'dataset-2': [Capability.PREVIEW],
        test_dataset_1: [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW],
      };

      const callEntitlementsEndpointSpy = jest
        .spyOn(EntitlementService.prototype, 'callEntitlementsEndpoint')
        .mockResolvedValue({ datasets: remoteEntitlements, configs: {} });

      const res = await request(app).get('/entitlements').query({ scope: 'datasets' }).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual(expectedEntitlements);

      // Clean up
      delete process.env.ENTITLEMENTS_ENDPOINT;
      callEntitlementsEndpointSpy.mockRestore();
    });
  });

  describe('GET /entitlements?scope=', () => {
    it('returns the configs sub-map (empty when the subject has no configs grants)', async () => {
      const res = await request(app).get('/entitlements').query({ scope: 'configs' }).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({});
    });

    it('returns the configs sub-map populated when the subject has configs grants', async () => {
      const entityManager = await getEntityManager();
      await entityManager.query(`
        UPDATE entitlements SET data = data || '{"configs": {"dashboard_1": ["read", "write"]}}'::jsonb WHERE id = 'everyone'
      `);

      const res = await request(app).get('/entitlements').query({ scope: 'configs' }).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ dashboard_1: ['read', 'write'] });
    });

    it('returns 400 when scope is missing', async () => {
      const res = await request(app).get('/entitlements').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('returns 400 when scope is invalid', async () => {
      const res = await request(app).get('/entitlements').query({ scope: 'not-a-real-scope' }).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    describe('scope=dashboards (config subkey filter)', () => {
      beforeEach(async () => {
        const entityManager = await getEntityManager();
        await entityManager.query(`
          UPDATE entitlements
          SET data = data || '{"configs": {"dashboards_1": ["read"], "dashboards_2": ["read"], "look_and_feel": ["read"]}}'::jsonb
          WHERE id = 'everyone'
        `);
      });

      it('returns only the configs entries under the dashboards subkey', async () => {
        const res = await request(app).get('/entitlements').query({ scope: 'dashboards' }).set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(StatusCodes.OK);
        expect(res.body).toEqual({ dashboards_1: ['read'], dashboards_2: ['read'] });
      });

      it('still returns every configs entry unfiltered for scope=configs (no regression)', async () => {
        const res = await request(app).get('/entitlements').query({ scope: 'configs' }).set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(StatusCodes.OK);
        expect(res.body).toEqual({ dashboards_1: ['read'], dashboards_2: ['read'], look_and_feel: ['read'] });
      });
    });
  });

  it('responds with an error', async () => {
    process.env.ENTITLEMENTS_ENDPOINT = 'http://mock-entitlements';

    const detail = 'Failed to fetch entitlements from endpoint: message';
    const callEntitlementsEndpointSpy = jest
      .spyOn(EntitlementService.prototype, 'callEntitlementsEndpoint')
      .mockRejectedValue(new Error(detail));

    const res = await request(app).get(`/entitlements`).query({ scope: 'datasets' }).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.body).toHaveProperty('detail', detail);

    // Clean up
    delete process.env.ENTITLEMENTS_ENDPOINT;
    callEntitlementsEndpointSpy.mockRestore();
  });
});
