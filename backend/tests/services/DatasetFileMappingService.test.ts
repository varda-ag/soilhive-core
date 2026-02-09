import { describe, it, expect, beforeAll } from '@jest/globals';
import { EntityManager } from 'typeorm';
import DatasetFileMappingService from '../../src/services/DatasetFileMappingService';
import DatasetService from '../../src/services/DatasetService';
import DataMappingService from '../../src/services/DataMappingService';
import { getEntityManager } from '../../src/utils/data-source';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { DatasetFileMappingRequest } from '../../src/interfaces/DatasetFileMapping';
import { CreateDatasetInput } from '../../src/types/DatasetInput';
import DatasetFileMappingEntity from '../../src/entities/DatasetFileMapping';
import FileEntity from '../../src/entities/File';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: () => false,
  isDataAdmin: () => false,
};

const service = new DatasetFileMappingService();
const datasetService = new DatasetService();
const dataMappingService = new DataMappingService();

let entityManager: EntityManager;
let requestData: RequestData;

describe('DatasetFileMappingService', () => {
  beforeAll(async () => {
    entityManager = await getEntityManager();
    requestData = {
      entityManager,
      token: mockToken,
    };
  });

  it('should insert a dataset_mapping_file with no file and no mappingId', async () => {
    // Arrange
    const input: CreateDatasetInput = {
      name: 'test-dataset',
    };
    const dataset = await datasetService.createDataset(requestData, input);
    const payload = {};

    // Act
    const result = await service.upsertMapping(requestData, dataset.slug, payload);

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();

    const saved = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(saved?.dataset_id).toBe(dataset.id);
    expect(saved?.data_mapping_id).toBeNull();
    expect(saved?.file_id).toBeNull();
  });

  it('should insert a dataset_mapping_file with just the file id', async () => {
    // Arrange
    const input: CreateDatasetInput = {
      name: 'test-dataset',
    };
    const dataset = await datasetService.createDataset(requestData, input);

    const fileRepo = entityManager.getRepository(FileEntity);
    const savedFile = await fileRepo.save(
      fileRepo.create({
        name: 'test-file',
        file_path: 'path',
        created_by: 'test-user',
      }),
    );

    const payload: DatasetFileMappingRequest = {
      fileID: savedFile.id,
    };

    // Act
    const result = await service.upsertMapping(requestData, dataset.slug, payload);

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();

    const saved = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(saved?.dataset_id).toBe(dataset.id);
    expect(saved?.data_mapping_id).toBeNull();
    expect(saved?.file_id).toBe(savedFile.id);
  });

  it('should create a dataset_mapping_file with file id and then add mapping id', async () => {
    // Arrange
    const input: CreateDatasetInput = {
      name: 'test-dataset',
    };
    const dataset = await datasetService.createDataset(requestData, input);

    const fileRepo = entityManager.getRepository(FileEntity);
    const savedFile = await fileRepo.save(
      fileRepo.create({
        name: 'test-file',
        file_path: 'path',
        created_by: 'test-user',
      }),
    );

    // Create initial mapping with file ID
    const initialPayload: DatasetFileMappingRequest = {
      fileID: savedFile.id,
    };
    const datasetFileMapping = await service.upsertMapping(requestData, dataset.slug, initialPayload);

    // Create data mapping
    const dataMapping = await dataMappingService.postDataMapping(requestData, {});

    // Update with mapping ID
    const updatePayload: DatasetFileMappingRequest = {
      mappingId: dataMapping.id,
    };

    // Act
    const result = await service.upsertMapping(requestData, dataset.slug, updatePayload, datasetFileMapping.id);

    // Assert
    const saved = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(saved?.dataset_id).toBe(dataset.id);
    expect(saved?.data_mapping_id).toBe(dataMapping.id);
    expect(saved?.file_id).toBe(savedFile.id);
  });

  it('should create a dataset_mapping_file with mapping id and then update the file id', async () => {
    // Arrange
    const input: CreateDatasetInput = {
      name: 'test-dataset',
    };
    const dataset = await datasetService.createDataset(requestData, input);

    // Create data mapping
    const dataMapping = await dataMappingService.postDataMapping(requestData, {});

    // Create initial mapping with mapping ID
    const initialPayload: DatasetFileMappingRequest = {
      mappingId: dataMapping.id,
    };
    const datasetMapping = await service.upsertMapping(requestData, dataset.slug, initialPayload);

    // Create file
    const fileRepo = entityManager.getRepository(FileEntity);
    const savedFile = await fileRepo.save(
      fileRepo.create({
        name: 'test-file',
        file_path: 'path',
        created_by: 'test-user',
      }),
    );

    // Update with file ID
    const updatePayload: DatasetFileMappingRequest = {
      fileID: savedFile.id,
    };

    // Act
    const result = await service.upsertMapping(requestData, dataset.slug, updatePayload, datasetMapping.id);

    // Assert
    const saved = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(saved?.dataset_id).toBe(dataset.id);
    expect(saved?.data_mapping_id).toBe(dataMapping.id);
    expect(saved?.file_id).toBe(savedFile.id);
  });
});
