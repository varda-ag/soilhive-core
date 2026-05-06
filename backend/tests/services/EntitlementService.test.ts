import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { EntityManager } from 'typeorm';
import { RequestData } from '../../src/interfaces/RequestData';
import { getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { addDataset } from '../../src/utils/mock';
import EntitlementService from '../../src/services/EntitlementService';
import DatasetService from '../../src/services/DatasetService';
import { Entitlements } from '../../src/types/Entitlements';
import { Capability } from '../../src/types/enums';
import DatasetEntity from '../../src/entities/Dataset';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

let entityManager: EntityManager;
let requestData: RequestData;

const service = new EntitlementService();

describe('EntitlementService', () => {
  beforeAll(async () => {
    entityManager = await getEntityManager();
    requestData = {
      entityManager,
      token: mockToken,
      entitlements: {},
    };
  });

  beforeEach(async () => {
    await addDataset('dataset-1', [0, 0, 1, 1]);
    await addDataset('dataset-2', [0, 0, 1, 1]);
    await addDataset('dataset-3', [0, 0, 1, 1]);
    const datasetService = new DatasetService();
    // Update all datasets to "private" visibility to test entitlements
    await datasetService.updateDataset(requestData, 'dataset-1', { visibility: 'private' });
    await datasetService.updateDataset(requestData, 'dataset-2', { visibility: 'private' });
    await datasetService.updateDataset(requestData, 'dataset-3', { visibility: 'private' });
    // Update dataset-1 slug to test slug history handling
    await datasetService.updateDataset(requestData, 'dataset-1', { name: 'dataset-1-renamed' });
    // Fill DB with test entitlements
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES
      ('everyone', '{"dataset-1": ["download"]}'),
      ('user1@example.com', '{"dataset-1": ["obfuscate_as_points", "preview", "download"]}'),
      ('user2@example.com', '{"dataset-2": ["obfuscate_as_points"]}'),
      ('user3@example.com', '{"dataset-3": ["obfuscate_as_points"], "dataset-1": ["obfuscate_as_points"]}'),
      ('user4@example.com', '{"spatial_filter": "world"}')
    `);
  });

  it.each([
    [undefined, { 'dataset-1': [Capability.DOWNLOAD] }],
    ['not-existing', { 'dataset-1': [Capability.DOWNLOAD] }],
    ['user1@example.com', { 'dataset-1': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW] }],
    ['user2@example.com', { 'dataset-1': [Capability.DOWNLOAD], 'dataset-2': [Capability.OBFUSCATE_AS_POINTS] }],
    [
      'user3@example.com',
      { 'dataset-1': [Capability.DOWNLOAD, Capability.OBFUSCATE_AS_POINTS], 'dataset-3': [Capability.OBFUSCATE_AS_POINTS] },
    ],
  ])('should retrieve user entitlements by ID', async (id, expectedEntitlements) => {
    const entitlements = await service.getUserEntitlements(requestData, id);
    expect(entitlements).toEqual(expectedEntitlements);
  });

  it.each([
    ['not-existing', {}],
    [
      'dataset-1',
      {
        everyone: [Capability.DOWNLOAD],
        'user1@example.com': [Capability.OBFUSCATE_AS_POINTS, Capability.PREVIEW, Capability.DOWNLOAD],
        'user3@example.com': [Capability.OBFUSCATE_AS_POINTS],
      },
    ],
    ['dataset-2', { 'user2@example.com': [Capability.OBFUSCATE_AS_POINTS] }],
    ['spatial_filter', { 'user4@example.com': 'world' }],
  ])('should retrieve entity entitlements', async (slug, expectedEntitlements) => {
    const entitlements = await service.getEntityEntitlements(requestData, slug);
    expect(entitlements).toEqual(expectedEntitlements);
  });

  it.each([
    ['not-existing-entity', { 'user@example.com': [Capability.OBFUSCATE_AS_POINTS] } as Entitlements],
    ['another-not-existing-entity', {}],
    ['dataset-1', {}],
    [
      'dataset-1',
      {
        everyone: [Capability.DOWNLOAD],
        'user1@example.com': [Capability.OBFUSCATE_AS_POINTS],
        'another@example.com': [Capability.OBFUSCATE_AS_POINTS],
      } as Entitlements,
    ],
    ['dataset-2', { 'another@example.com': [Capability.OBFUSCATE_AS_POINTS] } as Entitlements],
  ])('should set entitlements to entity and return the updated entitlements', async (slug: string, payload: Entitlements) => {
    const result = await service.setEntityEntitlements(requestData, slug, payload);
    expect(result).toEqual(payload);
    const entitlements = await service.getEntityEntitlements(requestData, slug);
    expect(entitlements).toEqual(payload);
  });

  describe('enforceEntitlements', () => {
    beforeEach(async () => {
      // Make dataset-1 public, dataset-2 and dataset-3 remain private (default)
      await entityManager.getRepository(DatasetEntity).update({ slug: 'dataset-1' }, { visibility: 'public' });
    });

    it('should not throw when all requested slugs do not exist', async () => {
      await expect(service.enforceEntitlements(requestData, ['non-existent'], Capability.DOWNLOAD)).resolves.toBeUndefined();
    });

    it('should not throw when all matching datasets are public', async () => {
      await expect(service.enforceEntitlements(requestData, ['dataset-1'], Capability.DOWNLOAD)).resolves.toBeUndefined();
    });

    it('should not throw for a mix of public and private when user has capability for private ones', async () => {
      const rd = { ...requestData, entitlements: { 'dataset-2': [Capability.DOWNLOAD] } };
      await expect(service.enforceEntitlements(rd, ['dataset-1', 'dataset-2'], Capability.DOWNLOAD)).resolves.toBeUndefined();
    });

    it('should not throw when user has the required capability for a private dataset', async () => {
      const rd = { ...requestData, entitlements: { 'dataset-2': [Capability.PREVIEW] } };
      await expect(service.enforceEntitlements(rd, ['dataset-2'], Capability.PREVIEW)).resolves.toBeUndefined();
    });

    it('should throw 403 when user has no entitlements for a private dataset', async () => {
      await expect(service.enforceEntitlements(requestData, ['dataset-2'], Capability.DOWNLOAD)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('should throw 403 when user has entitlements for a private dataset but not the required capability', async () => {
      const rd = { ...requestData, entitlements: { 'dataset-2': [Capability.PREVIEW] } };
      await expect(service.enforceEntitlements(rd, ['dataset-2'], Capability.DOWNLOAD)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('should throw 403 on the first private dataset the user lacks access to', async () => {
      const rd = { ...requestData, entitlements: { 'dataset-2': [Capability.DOWNLOAD] } };
      await expect(service.enforceEntitlements(rd, ['dataset-2', 'dataset-3'], Capability.DOWNLOAD)).rejects.toMatchObject({
        status: 403,
      });
    });

    it.each([
      { isInternalRequest: true, isDataAdmin: false, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: true, isSuperAdmin: false },
      { isInternalRequest: false, isDataAdmin: false, isSuperAdmin: true },
    ])('should not throw for internal requests or admins', async additionalData => {
      const rd = { ...requestData, token: { ...mockToken, ...additionalData }, entitlements: {} };
      await expect(service.enforceEntitlements(rd, ['dataset-2', 'dataset-3'], Capability.DOWNLOAD)).resolves.toBeUndefined();
    });
  });
});
