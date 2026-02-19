import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { addSyntheticData, syntheticDataOptions } from '../../../src/utils/mock';
import { processExportJob } from '../../../src/jobs/soil-export/soilExportJob';
import { Job } from 'pg-boss';
import { ExportJob } from '../../../src/interfaces/Job';
import { FileFormat } from '../../../src/jobs/soil-export/types';
import { StoredDataFilter } from '../../../src/interfaces/DatasetFilter';
import { RequestData } from '../../../src/interfaces/RequestData';
import FileService from '../../../src/services/FileService';
import * as storageHelpers from '../../../src/jobs/soil-export/storageHelpers';

// Mock FilterService module
const mockGetFilterById = jest.fn() as jest.MockedFunction<(requestData: RequestData, filterId: string) => Promise<StoredDataFilter>>;
jest.mock('../../../src/services/FilterService', () => {
  return jest.fn().mockImplementation(() => ({
    getFilterById: mockGetFilterById,
  }));
});

// Mock PgBoss module
const mockExecuteSql = jest.fn() as jest.MockedFunction<(sql: string, params: unknown[]) => Promise<void>>;
mockExecuteSql.mockResolvedValue(undefined);
jest.mock('../../../src/services/PgBoss', () => ({
  getPgBoss: jest.fn(() => ({
    getDb: () => ({
      executeSql: mockExecuteSql,
    }),
  })),
}));

// Mock storageHelpers module
jest.mock('../../../src/jobs/soil-export/storageHelpers', () => {
  const actual = jest.requireActual<typeof import('../../../src/jobs/soil-export/storageHelpers')>(
    '../../../src/jobs/soil-export/storageHelpers',
  );
  return {
    ...actual,
    generateDownloadPath: jest.fn(),
  };
});

const TEST_OUTPUT_DIR = path.join(__dirname, 'integration-output');

describe('Soil Export Job', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up test output
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    mockGetFilterById.mockClear();
    mockExecuteSql.mockClear();
    (storageHelpers.generateDownloadPath as jest.Mock).mockClear();
  });

  it('should export a single dataset with one observation to CSV and zip it', async () => {
    // 1. Setup: Create a dataset with 1 layer, 1 feature, 1 observation
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 100,
      depthLayers: 1,
      featureCount: 1,
      observationsPerLayer: 1,
      soilPropertyNames: ['aluminum'],
      featureCoordinates: [[-124.13, 40.47]],
    });

    // 2. Create mock job
    const mockJob: Job<ExportJob> = {
      id: 'test-job-001',
      name: 'export',
      data: {
        type: 'export',
        filter_id: 'test-filter-001',
        datasetSlugs: [dataset.slug],
        format: FileFormat.CSV,
        created_by: 'test-user',
        progress_percentage: 100, // since we are mocking pgBoss, there is no update
        totalRecordsEstimate: 1,
        totalRecordsProcessed: 1, // since we are mocking pgBoss, there is no update
        currentCursor: null,
        downloadUrl: null,
      },
      expireInSeconds: 30,
      signal: new AbortController().signal,
    };

    // 3. Mock getFilterById to return empty filter (no filtering)
    mockGetFilterById.mockResolvedValue({
      id: 'test-filter-001',
      filter: {
        geometries: [],
        parameters: {},
      },
    });

    // 4. Set up a fixed mock return value for generateDownloadPath (to avoid millisecond timing issues)
    const expectedDownloadPath = 'exports/2024/01/2024-01-15T10-30-00-000Z_test-filter-001.zip';
    (storageHelpers.generateDownloadPath as jest.Mock).mockReturnValue(expectedDownloadPath);

    // 5. Execute the job
    await processExportJob(mockJob);

    // 6. Verify: Check that the zip file was created at the expected path
    const fileService = new FileService();
    await expect(fileService.exists(expectedDownloadPath)).resolves.toBe(true);
  });
});
