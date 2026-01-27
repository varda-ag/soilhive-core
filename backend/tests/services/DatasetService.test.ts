import { describe, it, expect } from '@jest/globals';
import DatasetService from '../../src/services/DatasetService';
import { getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { RequestData } from '../../src/interfaces/RequestData';
import { CreateDatasetInput } from '../../src/types/DatasetInput';
import { GISDataType, IngestionStatus } from '../../src/types/data';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: () => false,
  isDataAdmin: () => false,
};

describe('DatasetService', () => {
  describe('createDataset', () => {
    it('should create a dataset with only name provided', async () => {
      const datasetService = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
      };
      const input: CreateDatasetInput = {
        name: 'Test Dataset',
      };

      const result = await datasetService.createDataset(requestData, input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Dataset');
      expect(result.slug).toBeTruthy();
      expect(result.created_by).toBe('test-user-id');
      expect(result.updated_by).toBe('test-user-id');
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('should create a dataset with all optional fields provided', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
      };
      const input: CreateDatasetInput = {
        name: 'Complete Dataset',
        full_name: 'Complete Test Dataset',
        version: '1.0.0',
        author: 'Test Author',
        description: 'A test dataset with all fields',
        data_producer: 'Test Producer',
        spatial_resolution: '1km',
        publication_date: '2024-01-01',
        reference_period_start: '2023-01-01',
        reference_period_stop: '2023-12-31',
        citation: 'Test Citation',
        geographical_extent: 'Global',
        gis_datatype: GISDataType.POINT,
        status: IngestionStatus.INGESTED,
      };

      const result = await service.createDataset(requestData, input);

      expect(result.name).toBe('Complete Dataset');
      expect(result.full_name).toBe('Complete Test Dataset');
      expect(result.version).toBe('1.0.0');
      expect(result.author).toBe('Test Author');
      expect(result.description).toBe('A test dataset with all fields');
      expect(result.data_producer).toBe('Test Producer');
      expect(result.spatial_resolution).toBe('1km');
      expect(result.publication_date).toBe('2024-01-01');
      expect(result.reference_period_start).toBe('2023-01-01');
      expect(result.reference_period_stop).toBe('2023-12-31');
      expect(result.citation).toBe('Test Citation');
      expect(result.geographical_extent).toBe('Global');
      expect(result.gis_datatype).toBe(GISDataType.POINT);
      expect(result.status).toBe(IngestionStatus.INGESTED);
      expect(result.slug).toBeDefined();
    });

    it('should throw error when creating dataset with duplicate name', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
      };
      const input: CreateDatasetInput = {
        name: 'Duplicate Dataset',
      };

      await service.createDataset(requestData, input);

      await expect(service.createDataset(requestData, input)).rejects.toThrow("Dataset with name 'Duplicate Dataset' already exists");
    });

    it('should throw error when token subject is missing', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const tokenWithoutSub: Token = {
        ...mockToken,
        sub: undefined,
      };
      const requestData: RequestData = {
        entityManager,
        token: tokenWithoutSub,
      };
      const input: CreateDatasetInput = {
        name: 'Test Dataset',
      };

      await expect(service.createDataset(requestData, input)).rejects.toThrow('Token subject is missing');
    });
  });
});
