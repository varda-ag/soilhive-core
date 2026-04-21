import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import { createReadmeFile } from '../../../src/jobs/soil-export/exportHelpers';
import * as pdfGenerator from '../../../src/jobs/soil-export/pdfGenerator';
import FileService from '../../../src/services/FileService';
import { FileFormat } from '../../../src/jobs/soil-export/types';

let mockStorageRead: jest.MockedFunction<(filePath: string) => Promise<Readable>>;
let generateExportPdfSpy: ReturnType<typeof jest.spyOn>;

// Builds requestData with a mock TypeORM repo. When logoFileKey is provided,
// findOneBy returns a matching JsonStorage row so ConfigService.getLogoFileKey
// returns the key; otherwise it returns null (no logo configured).
function makeRequestData(logoFileKey?: string) {
  const row = logoFileKey !== undefined ? { id: 'frontend-logo', data: { fileKey: logoFileKey }, deleted_at: null } : null;
  return {
    entityManager: {
      getRepository: jest.fn().mockReturnValue({
        findOneBy: jest.fn<() => Promise<any>>().mockResolvedValue(row),
        find: jest.fn<() => Promise<any>>().mockResolvedValue([
          {
            slug: 'dataset-alpha',
            name: 'Dataset Alpha',
          },
          {
            slug: 'dataset-beta',
            name: 'Dataset Beta',
          },
        ]),
      }),
    },
    entitlements: {},
  } as any;
}

function makePayload(overrides = {}) {
  return {
    filter_id: 'filter-123',
    dataset_ids: ['dataset-alpha', 'dataset-beta'],
    format: FileFormat.CSV,
    ...overrides,
  };
}

beforeEach(() => {
  mockStorageRead = jest.fn<(filePath: string) => Promise<Readable>>();
  generateExportPdfSpy = jest.spyOn(pdfGenerator, 'generateExportPdf').mockResolvedValue(undefined);
  jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ read: mockStorageRead } as any);
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

    await createReadmeFile(makeRequestData('logos/logo.png'), '/tmp', makePayload());

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

    await expect(createReadmeFile(makeRequestData('logos/logo.png'), '/tmp', makePayload())).rejects.toThrow('Storage unavailable');
  });
});

describe('createReadmeFile E2E (real pdfkit, no generateExportPdf mock)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-e2e-'));
    // The outer beforeEach mocked generateExportPdf — restore it so real pdfkit runs.
    generateExportPdfSpy.mockRestore();
    // Still mock storage to avoid real S3/local FS reads.
    mockStorageRead = jest.fn<(filePath: string) => Promise<Readable>>();
    jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ read: mockStorageRead } as any);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
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
    const fakeLogoBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    mockStorageRead.mockResolvedValue(Readable.from([fakeLogoBuffer]));

    await createReadmeFile(makeRequestData('logos/logo.png'), tempDir, makePayload());

    const pdfPath = path.join(tempDir, 'Readme.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.readFileSync(pdfPath).subarray(0, 4).toString()).toBe('%PDF');
  });
});
