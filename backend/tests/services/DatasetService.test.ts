import { describe, it, expect } from '@jest/globals';
import DatasetService from '../../src/services/DatasetService';
import { getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { RequestData } from '../../src/interfaces/RequestData';
import { CreateDatasetInput, UpdateDatasetInput } from '../../src/types/DatasetInput';
import { GISDataType, IngestionStatus } from '../../src/types/data';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

describe('DatasetService', () => {
  describe('createDataset', () => {
    it('should create a dataset with only name provided', async () => {
      const datasetService = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
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
        entitlements: {},
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
        status: IngestionStatus.LOADED,
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
      expect(result.status).toBe(IngestionStatus.LOADED);
      expect(result.slug).toBeDefined();
    });

    it('should throw error when creating dataset with duplicate name', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
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
        entitlements: {},
      };
      const input: CreateDatasetInput = {
        name: 'Test Dataset',
      };

      await expect(service.createDataset(requestData, input)).rejects.toThrow('Token subject is missing');
    });
  });

  describe('updateDataset', () => {
    it('should update only the name field and generate new slug', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      const createInput: CreateDatasetInput = {
        name: 'Original Dataset',
        full_name: 'Original Full Name',
        version: '1.0.0',
        author: 'Original Author',
        description: 'Original description',
      };
      const created = await service.createDataset(requestData, createInput);
      const originalSlug = created.slug;
      const originalId = created.id;

      const updateInput: UpdateDatasetInput = {
        name: 'Updated Dataset',
      };
      const updated = await service.updateDataset(requestData, originalSlug, updateInput);

      expect(updated.name).toBe('Updated Dataset');
      expect(updated.slug).not.toBe(originalSlug);
      expect(updated.slug).toBeDefined();

      expect(updated.id).toBe(originalId);
      expect(updated.full_name).toBe('Original Full Name');
      expect(updated.version).toBe('1.0.0');
      expect(updated.author).toBe('Original Author');
      expect(updated.description).toBe('Original description');

      expect(updated.updated_by).toBe('test-user-id');
      expect(updated.updated_at).toBeDefined();
    });

    it('should set a field to null', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      // Create dataset with full_name
      const createInput: CreateDatasetInput = {
        name: 'Dataset With Full Name',
        full_name: 'This is the full name',
        description: 'Some description',
      };
      const created = await service.createDataset(requestData, createInput);

      // Update to set full_name to null
      const updateInput: UpdateDatasetInput = {
        full_name: null,
      };
      const updated = await service.updateDataset(requestData, created.slug, updateInput);

      // Verify full_name is now null
      expect(updated.full_name).toBeNull();

      // Verify other fields remain unchanged
      expect(updated.name).toBe('Dataset With Full Name');
      expect(updated.description).toBe('Some description');
    });

    it('should allow update using old slug after name change', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      const createInput: CreateDatasetInput = {
        name: 'First Name',
        description: 'Original description',
      };
      const created = await service.createDataset(requestData, createInput);
      const oldSlug = created.slug;

      // change name (which changes slug)
      const firstUpdate: UpdateDatasetInput = {
        name: 'Second Name',
      };
      const afterFirstUpdate = await service.updateDataset(requestData, oldSlug, firstUpdate);
      const newSlug = afterFirstUpdate.slug;

      expect(newSlug).not.toBe(oldSlug);

      // use the old slug to update description
      const secondUpdate: UpdateDatasetInput = {
        description: 'Updated description',
      };
      const afterSecondUpdate = await service.updateDataset(requestData, oldSlug, secondUpdate);

      // Verify update worked with old slug
      expect(afterSecondUpdate.id).toBe(created.id);
      expect(afterSecondUpdate.slug).toBe(newSlug);
      expect(afterSecondUpdate.name).toBe('Second Name');
      expect(afterSecondUpdate.description).toBe('Updated description');
    });

    it('should throw error when updating non-existent dataset', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      const updateInput: UpdateDatasetInput = {
        description: 'Some description',
      };

      await expect(service.updateDataset(requestData, 'non-existent-slug', updateInput)).rejects.toThrow(
        "Resource 'non-existent-slug' not found",
      );
    });
  });

  describe('deleteDataset', () => {
    it('should successfully soft-delete an existing dataset', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      // 1. Create a dataset to delete
      const createInput: CreateDatasetInput = {
        name: 'Dataset to Delete',
      };
      const created = await service.createDataset(requestData, createInput);
      const slug = created.slug;

      // 2. Delete the dataset
      await service.deleteDataset(requestData, slug);

      // 3. Verify it can no longer be retrieved via getDataset
      // getDataset throws a 404 ErrorResponse when not found
      await expect(service.getDataset(requestData, slug)).rejects.toThrow(`Resource '${slug}' not found`);

      // 4. Verify it's removed from the list of datasets
      const allDatasets = await service.getDatasets(requestData);
      expect(allDatasets.find(d => d.slug === slug)).toBeUndefined();
    });

    it('should throw 404 when attempting to delete a non-existent dataset', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      await expect(service.deleteDataset(requestData, 'non-existent-slug')).rejects.toThrow("Resource 'non-existent-slug' not found");
    });
    it('should successfully delete a dataset using an old slug after name change', async () => {
      const service = new DatasetService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = {
        entityManager,
        token: mockToken,
        entitlements: {},
      };

      const created = await service.createDataset(requestData, { name: 'Delete Me Original' });
      const oldSlug = created.slug;

      await service.updateDataset(requestData, oldSlug, { name: 'Delete Me Renamed' });

      // old slug should still resolve and delete successfully
      await service.deleteDataset(requestData, oldSlug);

      // verify it's gone via both old and new slug
      await expect(service.getDataset(requestData, oldSlug)).rejects.toThrow();
      await expect(service.getDataset(requestData, 'delete-me-renamed')).rejects.toThrow();
    });
  });
});
