import { describe, it, expect, beforeAll } from '@jest/globals';
import { EntityManager } from 'typeorm';
import { RequestData } from '../../src/interfaces/RequestData';
import { getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { addDataset } from '../../src/utils/mock';
import EntitlementService from '../../src/services/EntitlementService';
import DatasetService from '../../src/services/DatasetService';
import { Entitlements } from '../../src/types/Entitlements';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: () => false,
  isDataAdmin: () => false,
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
    };
  });

  beforeEach(async () => {
    await addDataset('dataset-1', [0, 0, 1, 1]);
    await addDataset('dataset-2', [0, 0, 1, 1]);
    await addDataset('dataset-3', [0, 0, 1, 1]);
    // Update dataset-1 slug to test slug history handling
    const datasetService = new DatasetService();
    await datasetService.updateDataset(requestData, 'dataset-1', { name: 'dataset-1-renamed' });
    // Fill DB with test entitlements
    await entityManager.query(`
      INSERT INTO entitlements (id, data) VALUES
      ('everyone', '{"dataset-1": ["download"]}'),
      ('user1@example.com', '{"dataset-1": ["obfuscate_as_points", "preview", "download"]}'),
      ('user2@example.com', '{"dataset-2": ["obfuscate_as_points"]}'),
      ('user3@example.com', '{"dataset-3": ["obfuscate_as_points"], "dataset-1": ["obfuscate_as_points"]}')
    `);
  });

  it.each([
    [undefined, { 'dataset-1': ['download'] }],
    ['not-existing', { 'dataset-1': ['download'] }],
    ['user1@example.com', { 'dataset-1': ['download', 'obfuscate_as_points', 'preview'] }],
    ['user2@example.com', { 'dataset-1': ['download'], 'dataset-2': ['obfuscate_as_points'] }],
    ['user3@example.com', { 'dataset-1': ['download', 'obfuscate_as_points'], 'dataset-3': ['obfuscate_as_points'] }],
  ])('should retrieve user entitlements by ID', async (id, expectedEntitlements) => {
    const entitlements = await service.getUserEntitlements(requestData, id);
    expect(entitlements).toEqual(expectedEntitlements);
  });

  it.each([
    ['not-existing', {}],
    [
      'dataset-1',
      {
        everyone: ['download'],
        'user1@example.com': ['obfuscate_as_points', 'preview', 'download'],
        'user3@example.com': ['obfuscate_as_points'],
      },
    ],
    ['dataset-2', { 'user2@example.com': ['obfuscate_as_points'] }],
  ])('should retrieve entity entitlements', async (slug, expectedEntitlements) => {
    const entitlements = await service.getEntityEntitlements(requestData, slug);
    expect(entitlements).toEqual(expectedEntitlements);
  });

  it.each([
    ['not-existing-entity', { 'user@example.com': ['obfuscate_as_points'] } as Entitlements],
    ['another-not-existing-entity', {}],
    ['dataset-1', {}],
    [
      'dataset-1',
      {
        everyone: ['download'],
        'user1@example.com': ['obfuscate_as_points'],
        'another@example.com': ['obfuscate_as_points'],
      } as Entitlements,
    ],
    ['dataset-2', { 'another@example.com': ['obfuscate_as_points'] } as Entitlements],
  ])('should set entitlements to entity', async (slug: string, payload: Entitlements) => {
    await service.setEntityEntitlements(requestData, slug, payload);
    const entitlements = await service.getEntityEntitlements(requestData, slug);
    expect(entitlements).toEqual(payload);
  });
});
