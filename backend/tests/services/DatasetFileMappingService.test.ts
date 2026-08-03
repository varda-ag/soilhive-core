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
import { addDataMapping, addDataset, addFile } from '../../src/utils/mock';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
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
      entitlements: {},
    };
  });

  it('should retrieve a dataset file mapping by ID', async () => {
    const service = new DatasetFileMappingService();

    const dataset = await addDataset('test-dataset', [0, 0, 1, 1]);

    const dataMapping = await addDataMapping({});

    const datasetFileMapping = await service.createMapping(requestData, dataset.slug, {
      mappingId: dataMapping.id,
    });

    // Get the mapping
    const result = await service.getDatasetFileMapping(requestData, datasetFileMapping.id);
    expect(result).toBeDefined();
    expect(result.id).toBe(datasetFileMapping.id);
    expect(result.data_mapping_id).toBe(dataMapping.id);
  });

  it('should throw 404 when dataset file mapping not found', async () => {
    const service = new DatasetFileMappingService();
    await expect(service.getDatasetFileMapping(requestData, '00000000-0000-0000-0000-000000000000')).rejects.toThrow('not found');
  });

  it('should retrieve all mappings for a dataset', async () => {
    const service = new DatasetFileMappingService();

    const dataset = await addDataset('test-dataset-mappings', [0, 0, 1, 1]);

    const file1 = await addFile('path 1');
    const file2 = await addFile('path 2');

    await service.createMapping(requestData, dataset.slug, { fileID: file1.slug });
    await service.createMapping(requestData, dataset.slug, { fileID: file2.slug });

    const result = await service.getMappings(requestData, dataset.slug);

    expect(result).toBeDefined();
    expect(result.length).toBe(2);
  });

  it('should filter mappings by fileId', async () => {
    const service = new DatasetFileMappingService();

    const dataset = await addDataset('test-dataset-file-filter', [0, 0, 1, 1]);

    const file1 = await addFile('path 1');
    const file2 = await addFile('path 2');

    await service.createMapping(requestData, dataset.slug, { fileID: file1.slug });
    await service.createMapping(requestData, dataset.slug, { fileID: file2.slug });

    const result = await service.getMappings(requestData, dataset.slug, file1.slug);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].file_id).toBe(file1.id);
  });

  it('should return empty array when no mappings found for dataset', async () => {
    const service = new DatasetFileMappingService();
    const entityManager = await getEntityManager();
    const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };

    // Create empty dataset
    const dataset = await addDataset('empty-dataset', [0, 0, 1, 1]);
    const result = await service.getMappings(requestData, dataset.slug);
    expect(result).toBeDefined();
    expect(result.length).toBe(0);
  });

  it('should insert a dataset_mapping_file with no file and no mappingId', async () => {
    // Arrange
    const input: CreateDatasetInput = {
      name: 'test-dataset',
    };
    const dataset = await datasetService.createDataset(requestData, input);
    const payload = {};

    // Act
    const result = await service.createMapping(requestData, dataset.slug, payload);

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

    const savedFile = await addFile('test-file');

    const payload: DatasetFileMappingRequest = {
      fileID: savedFile.slug,
    };

    // Act
    const result: DatasetFileMappingEntity = await service.createMapping(requestData, dataset.slug, payload);
    expect(result).toBeDefined();

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.file_id).toBeDefined();
    expect(result.data_mapping_id).toBeNull();

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

    const file = await addFile('test-file');

    // Create initial mapping with file ID
    const initialPayload: DatasetFileMappingRequest = {
      fileID: file.slug,
    };
    const datasetFileMapping = await service.createMapping(requestData, dataset.slug, initialPayload);

    // Create data mapping
    const dataMapping = await dataMappingService.postDataMapping(requestData, {});

    // Update with mapping ID
    const updatePayload: DatasetFileMappingRequest = {
      mappingId: dataMapping.id,
    };

    // Act
    const result = await service.updateMapping(requestData, dataset.slug, datasetFileMapping.id, updatePayload);

    // Assert
    const savedDatasetFileMapping = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(savedDatasetFileMapping?.dataset_id).toBe(dataset.id);
    expect(savedDatasetFileMapping?.data_mapping_id).toBe(dataMapping.id);
    expect(savedDatasetFileMapping?.file_id).toBe(file.id);
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
    const datasetMapping = await service.createMapping(requestData, dataset.slug, initialPayload);

    // Create file
    const savedFile = await addFile('test-file');

    // Update with file ID
    const updatePayload: DatasetFileMappingRequest = {
      fileID: savedFile.slug,
    };

    // Act
    const result = await service.updateMapping(requestData, dataset.slug, datasetMapping.id, updatePayload);

    // Assert
    const savedDatasetFileMapping = await entityManager.getRepository(DatasetFileMappingEntity).findOneBy({ id: result.id });

    expect(savedDatasetFileMapping?.dataset_id).toBe(dataset.id);
    expect(savedDatasetFileMapping?.data_mapping_id).toBe(dataMapping.id);
    expect(savedDatasetFileMapping?.file_id).toBe(savedFile.id);
  });

  it('should throw a conflict error when creating a duplicate dataset_mapping_file', async () => {
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
    const reloaded = await fileRepo.findOneBy({ id: savedFile.id });

    // Create data mapping
    const dataMapping = await dataMappingService.postDataMapping(requestData, {});

    const payload: DatasetFileMappingRequest = {
      fileID: reloaded!.slug,
      mappingId: dataMapping.id,
    };

    // Create the first mapping successfully
    await service.createMapping(requestData, dataset.slug, payload);

    // Act & Assert
    // Attempt to create a duplicate mapping with the same dataset_id, file_id, and mappingId
    await expect(service.createMapping(requestData, dataset.slug, payload)).rejects.toThrow(/already exists/);
  });

  it('should delete dataset file mapping by file id', async () => {
    // Arrange
    const dataset = await addDataset('test-dataset-delete-mapping', [0, 0, 1, 1]);

    const file = await addFile('test-file-delete-mapping');

    await service.createMapping(requestData, dataset.slug, { fileID: file.slug });

    // Act
    await service.deleteDataMappingByFileId(requestData, dataset.slug, file.slug);

    // Assert
    const mappings = await service.getMappings(requestData, dataset.slug, file.slug);
    expect(mappings).toBeDefined();
    expect(mappings.length).toBe(0);
  });
});

describe('DatasetFileMappingService.currentMappingsByFile', () => {
  // Built in memory rather than saved: the rule is about ordering rows, and the interesting cases
  // (identical timestamps, a null updated_at) are ones the database will not readily produce.
  const mapping = (id: string, fileId: string | undefined, updatedAt: Date | null): DatasetFileMappingEntity =>
    ({ id, file_id: fileId, updated_at: updatedAt, data_mapping_id: `dm-${id}` }) as DatasetFileMappingEntity;

  it('keeps the most recently updated mapping of each file', () => {
    const older = mapping('0197a000-0000-7000-8000-000000000001', 'file-a', new Date('2026-01-01T00:00:00Z'));
    const newer = mapping('0197a000-0000-7000-8000-000000000002', 'file-a', new Date('2026-02-01T00:00:00Z'));

    expect(DatasetFileMappingService.currentMappingsByFile([older, newer]).get('file-a')).toBe(newer);
    // Input order must not decide the outcome — getMappings has no ORDER BY.
    expect(DatasetFileMappingService.currentMappingsByFile([newer, older]).get('file-a')).toBe(newer);
  });

  it('prefers a mapping updated later over one created later', () => {
    // The UI re-declares a mapping by repointing an existing row, so the current mapping is
    // routinely the one with the *lower* id.
    const editedLater = mapping('0197a000-0000-7000-8000-000000000001', 'file-a', new Date('2026-03-01T00:00:00Z'));
    const createdLater = mapping('0197a000-0000-7000-8000-000000000002', 'file-a', new Date('2026-02-01T00:00:00Z'));

    expect(DatasetFileMappingService.currentMappingsByFile([editedLater, createdLater]).get('file-a')).toBe(editedLater);
  });

  it('breaks an identical updated_at with the later id', () => {
    // Both timestamp defaults are now(), which is transaction-wide, so rows inserted together
    // share an updated_at to the microsecond.
    const sameInstant = new Date('2026-01-01T00:00:00Z');
    const first = mapping('0197a000-0000-7000-8000-000000000001', 'file-a', sameInstant);
    const second = mapping('0197a000-0000-7000-8000-000000000002', 'file-a', sameInstant);

    expect(DatasetFileMappingService.currentMappingsByFile([first, second]).get('file-a')).toBe(second);
    expect(DatasetFileMappingService.currentMappingsByFile([second, first]).get('file-a')).toBe(second);
  });

  it('treats a null updated_at as older than any timestamp', () => {
    const nullUpdated = mapping('0197a000-0000-7000-8000-000000000009', 'file-a', null);
    const timestamped = mapping('0197a000-0000-7000-8000-000000000001', 'file-a', new Date('2026-01-01T00:00:00Z'));

    expect(DatasetFileMappingService.currentMappingsByFile([nullUpdated, timestamped]).get('file-a')).toBe(timestamped);
  });

  it('resolves each file independently and drops mappings with no file', () => {
    const fileA = mapping('0197a000-0000-7000-8000-000000000001', 'file-a', new Date('2026-01-01T00:00:00Z'));
    const fileB = mapping('0197a000-0000-7000-8000-000000000002', 'file-b', new Date('2025-01-01T00:00:00Z'));
    const unattached = mapping('0197a000-0000-7000-8000-000000000003', undefined, new Date('2027-01-01T00:00:00Z'));

    const current = DatasetFileMappingService.currentMappingsByFile([fileA, fileB, unattached]);

    // file-b's mapping is the oldest of the three and still current for its own file.
    expect(current.get('file-a')).toBe(fileA);
    expect(current.get('file-b')).toBe(fileB);
    expect(current.size).toBe(2);
  });

  it('returns an empty map for no mappings', () => {
    expect(DatasetFileMappingService.currentMappingsByFile([]).size).toBe(0);
  });
});
