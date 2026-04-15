import { describe, it, expect } from '@jest/globals';
import DataMappingService from '../../src/services/DataMappingService';
import { getEntityManager } from '../../src/utils/data-source';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import DataMappingEntity from '../../src/entities/DataMapping';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: () => false,
  isDataAdmin: () => false,
};

describe('DataMappingService', () => {
  describe('postDataMapping', () => {
    it('should create a new data mapping record when the hash is unique', async () => {
      const service = new DataMappingService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };

      const dataMapping = {
        magnesium: {
          property_id: 'magnesium',
        },
      };

      const result = await service.postDataMapping(requestData, dataMapping);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.data_mapping).toEqual(dataMapping);
    });

    it('should return the existing record (idempotency) when the same data mapping is posted', async () => {
      const service = new DataMappingService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };

      const dataMapping = {
        calcium: {
          property_id: 'calcium',
        },
      };

      const firstResult = await service.postDataMapping(requestData, dataMapping);
      const originalId = firstResult.id;

      const secondResult = await service.postDataMapping(requestData, dataMapping);

      expect(secondResult.id).toBe(originalId);
      expect(secondResult.data_mapping).toEqual(firstResult.data_mapping);
    });
  });

  it('should soft delete an existing mapping', async () => {
    const service = new DataMappingService();
    const entityManager = await getEntityManager();
    const requestData = { entityManager, token: mockToken, entitlements: {} };

    const created = await service.postDataMapping(requestData, { test: 'data' });

    await service.deleteDataMapping(requestData, created.id);

    // findOneBy ignores soft-deleted rows by default in TypeORM
    const found = await entityManager.getRepository(DataMappingEntity).findOneBy({ id: created.id });
    expect(found).toBeNull();
  });
});
