import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import { createReadmeFile } from '../../../src/jobs/soil-export/exportHelpers';
import * as pdfGenerator from '../../../src/jobs/soil-export/pdfGenerator';
import FileService from '../../../src/services/FileService';
import RasterFilterService from '../../../src/services/RasterFilterService';
import SoilPropertyService from '../../../src/services/SoilPropertyService';
import { FileFormat } from '../../../src/jobs/soil-export/types';

const mockFilterEntity = {
  filter: {
    geometries: [],
    parameters: {
      data_types: ['point'],
      licenses: ['cc0'],
      min_sampling_date: '2020-01-01',
      max_sampling_date: '2021-01-01',
      min_depth: 0,
      max_depth: 100,
      horizons: ['A', 'B'],
      soil_properties: ['ph', 'organic_carbon'],
      raster_filters: { 'raster-table': [1, 2, 3] },
    },
  },
};

let mockStorageRead: jest.MockedFunction<(filePath: string) => Promise<Readable>>;
let generateExportPdfSpy: ReturnType<typeof jest.spyOn>;

// Builds requestData with a mock TypeORM repo. When logoFileKey is provided,
// findOneBy returns a matching JsonStorage row so ConfigService.getLogoFileKey
// returns the key; otherwise it returns null (no logo configured).
function makeRequestData({
  withLogo = false,
  datasets,
}: { withLogo?: boolean; datasets?: Array<{ slug: string; name: string; gis_datatype: string }> } = {}) {
  const rowById: Record<string, any> = {
    ...(withLogo ? { 'frontend-logo': { id: 'frontend-logo', data: { fileKey: 'logos/logo.png' }, deleted_at: null } } : {}),
    'filter-123': mockFilterEntity,
  };
  return {
    entityManager: {
      getRepository: jest.fn().mockReturnValue({
        findOneBy: jest
          .fn<(criteria: Record<string, any>) => Promise<any>>()
          .mockImplementation(criteria => Promise.resolve(rowById[criteria.id] ?? null)),
        find: jest.fn<() => Promise<any>>().mockResolvedValue(
          datasets ?? [
            { slug: 'dataset-alpha', name: 'Dataset Alpha', gis_datatype: 'point' },
            { slug: 'dataset-beta', name: 'Dataset Beta', gis_datatype: 'point' },
          ],
        ),
      }),
    },
    entitlements: {},
  } as any;
}

function makePayload(overrides = {}) {
  return {
    filter_id: 'filter-123',
    dataset_ids: ['dataset-alpha', 'dataset-beta'],
    format: FileFormat.GEOJSON,
    public_homepage_url: 'https://example.com',
    public_terms_url: 'https://example.com/terms',
    public_metadata_urls: {
      'dataset-alpha': 'https://example.com/datasets/alpha/metadata',
      'dataset-beta': 'https://example.com/datasets/beta/metadata',
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockStorageRead = jest.fn<(filePath: string) => Promise<Readable>>();
  generateExportPdfSpy = jest.spyOn(pdfGenerator, 'generateExportPdf').mockResolvedValue(undefined);
  jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ read: mockStorageRead } as any);
  jest.spyOn(SoilPropertyService.prototype, 'getSoilPropertiesBySlug').mockResolvedValue([
    { id: '1', slug: 'ph', property_name: 'pH', property_acronym: 'pH', category_id: 'cat-1', original_units_of_measurement: [] },
    {
      id: '2',
      slug: 'organic_carbon',
      property_name: 'Organic carbon',
      property_acronym: 'OC',
      category_id: 'cat-1',
      original_units_of_measurement: [],
    },
  ] as any);
  jest.spyOn(RasterFilterService.prototype, 'getRasterFilters').mockResolvedValue([
    {
      id: 'raster-table',
      name: 'Land cover',
      description: '',
      mappings: { Forest: 1, Cropland: 2, Grassland: 3 },
      created_at: new Date(),
      updated_at: null,
    },
  ] as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createReadmeFile', () => {
  it('creates Readme.pdf in tempDir', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-test-'));

    await createReadmeFile(makeRequestData(), tempDir, makePayload());

    expect(generateExportPdfSpy).toHaveBeenCalledTimes(1);
    expect((generateExportPdfSpy.mock.calls[0][0] as any).outputPath).toBe(path.join(tempDir, 'Readme.pdf'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes null logoBuffer when no logo key is configured', async () => {
    await createReadmeFile(makeRequestData(), '/tmp', makePayload());

    expect((generateExportPdfSpy.mock.calls[0][0] as any).logoBuffer).toBeNull();
    expect(FileService.getStorageEngine).not.toHaveBeenCalled();
  });

  it('reads logo from storage when a logo key is configured', async () => {
    const fakeBuffer = Buffer.from('PNG_DATA');
    mockStorageRead.mockResolvedValue(Readable.from([fakeBuffer]));

    await createReadmeFile(makeRequestData({ withLogo: true }), '/tmp', makePayload());

    expect(FileService.getStorageEngine).toHaveBeenCalledTimes(1);
    expect(mockStorageRead).toHaveBeenCalledWith('logos/logo.png');
    expect((generateExportPdfSpy.mock.calls[0][0] as any).logoBuffer).toEqual(fakeBuffer);
  });

  it('passes dataset slugs and file format from payload', async () => {
    const payload = makePayload({ dataset_ids: ['dataset-alpha', 'dataset-beta'], format: FileFormat.GPKG });

    await createReadmeFile(makeRequestData(), '/tmp', payload);

    const call = generateExportPdfSpy.mock.calls[0][0] as any;
    expect(call.datasets[0].slug).toEqual('dataset-alpha');
    expect(call.datasets[1].slug).toEqual('dataset-beta');
    expect(call.fileFormat).toBe(FileFormat.GPKG);
  });

  it('passes an exportDate close to now', async () => {
    const before = Date.now();

    await createReadmeFile(makeRequestData(), '/tmp', makePayload());

    const after = Date.now();
    const exportDate: Date = (generateExportPdfSpy.mock.calls[0][0] as any).exportDate;
    expect(exportDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(exportDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('propagates errors from generateExportPdf', async () => {
    generateExportPdfSpy.mockRejectedValueOnce(new Error('PDF write failed'));

    await expect(createReadmeFile(makeRequestData(), '/tmp', makePayload())).rejects.toThrow('PDF write failed');
  });

  it('propagates errors from storage.read()', async () => {
    mockStorageRead.mockRejectedValue(new Error('Storage unavailable'));

    await expect(createReadmeFile(makeRequestData({ withLogo: true }), '/tmp', makePayload())).rejects.toThrow('Storage unavailable');
  });
});

describe('createReadmeFile E2E (real pdfkit, no generateExportPdf mock)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp'; //fs.mkdtempSync(path.join(os.tmpdir(), 'readme-e2e-'));
    // The outer beforeEach mocked generateExportPdf — restore it so real pdfkit runs.
    generateExportPdfSpy.mockRestore();
    // Still mock storage to avoid real S3/local FS reads.
    mockStorageRead = jest.fn<(filePath: string) => Promise<Readable>>();
    jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ read: mockStorageRead } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produces a valid PDF file', async () => {
    await createReadmeFile(makeRequestData(), tempDir, makePayload());

    const pdfPath = path.join(tempDir, 'Readme.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    const header = fs.readFileSync(pdfPath).subarray(0, 4).toString();
    expect(header).toBe('%PDF');
  });

  it('PDF has exactly 4 pages', async () => {
    await createReadmeFile(makeRequestData(), tempDir, makePayload());

    const content = fs.readFileSync(path.join(tempDir, 'Readme.pdf')).toString('latin1');
    // Use the page tree /Count entry — more reliable than scanning for /Type /Page
    // which can match inside uncompressed content streams.
    const countMatch = content.match(/\/Count\s+(\d+)/);
    expect(countMatch).not.toBeNull();
    expect(parseInt(countMatch![1], 10)).toBe(4);
  });

  it('produces a valid PDF when a logo buffer is provided', async () => {
    const fakeLogoBuffer = fs.readFileSync(path.join(__dirname, '../../assets/logo.png'));
    mockStorageRead.mockResolvedValue(Readable.from([fakeLogoBuffer]));

    await createReadmeFile(makeRequestData({ withLogo: true }), tempDir, makePayload());

    const pdfPath = path.join(tempDir, 'Readme.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.readFileSync(pdfPath).subarray(0, 4).toString()).toBe('%PDF');
  });

  describe('field dictionary page inclusion based on gis_datatype', () => {
    function pageCount(pdfPath: string): number {
      const content = fs.readFileSync(pdfPath).toString('latin1');
      const match = content.match(/\/Count\s+(\d+)/);
      expect(match).not.toBeNull();
      return parseInt(match![1], 10);
    }

    it('includes field dictionary (4 pages) when all datasets are non-raster', async () => {
      const requestData = makeRequestData({
        datasets: [
          { slug: 'dataset-alpha', name: 'Dataset Alpha', gis_datatype: 'point' },
          { slug: 'dataset-beta', name: 'Dataset Beta', gis_datatype: 'point' },
        ],
      });
      await createReadmeFile(requestData, tempDir, makePayload());
      expect(pageCount(path.join(tempDir, 'Readme.pdf'))).toBe(4);
    });

    it('omits field dictionary (3 pages) when all datasets are raster', async () => {
      const requestData = makeRequestData({
        datasets: [
          { slug: 'dataset-alpha', name: 'Dataset Alpha', gis_datatype: 'raster' },
          { slug: 'dataset-beta', name: 'Dataset Beta', gis_datatype: 'raster' },
        ],
      });
      await createReadmeFile(requestData, tempDir, makePayload());
      expect(pageCount(path.join(tempDir, 'Readme.pdf'))).toBe(3);
    });

    it('includes field dictionary (4 pages) when datasets mix non-raster and raster', async () => {
      const requestData = makeRequestData({
        datasets: [
          { slug: 'dataset-alpha', name: 'Dataset Alpha', gis_datatype: 'point' },
          { slug: 'dataset-beta', name: 'Dataset Beta', gis_datatype: 'raster' },
        ],
      });
      await createReadmeFile(requestData, tempDir, makePayload());
      expect(pageCount(path.join(tempDir, 'Readme.pdf'))).toBe(4);
    });
  });
});
