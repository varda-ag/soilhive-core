import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Readable } from 'stream';
import FileService from '../../src/services/FileService';
import { JsonStorage } from '../../src/entities/JsonStorage';
import { Repository } from 'typeorm';

let mockStorageRead: jest.MockedFunction<(filePath: string) => Promise<Readable>>;

// Builds a mock JsonStorage repo whose findOneBy returns the given logo row (or null).
function makeRepo(row: Partial<JsonStorage> | null): Repository<JsonStorage> {
  return {
    findOneBy: jest.fn<() => Promise<any>>().mockResolvedValue(row),
  } as unknown as Repository<JsonStorage>;
}

beforeEach(() => {
  mockStorageRead = jest.fn<(filePath: string) => Promise<Readable>>();
  jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ read: mockStorageRead } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FileService.getLogo', () => {
  it('returns null when no logo row exists', async () => {
    const result = await FileService.getLogo(makeRepo(null));

    expect(result).toBeNull();
    expect(FileService.getStorageEngine).not.toHaveBeenCalled();
  });

  it('decodes base64 bytes from the DB without reading storage', async () => {
    const original = Buffer.from('PNG_DATA');
    const repo = makeRepo({ id: 'frontend-logo', data: { fileKey: 'logos/logo.png', bytes: original.toString('base64') } });

    const result = await FileService.getLogo(repo);

    expect(result).toEqual({ buffer: original, fileKey: 'logos/logo.png' });
    expect(FileService.getStorageEngine).not.toHaveBeenCalled();
  });

  it('falls back to reading from storage when the row has no bytes', async () => {
    const original = Buffer.from('PNG_DATA');
    mockStorageRead.mockResolvedValue(Readable.from([original]));
    const repo = makeRepo({ id: 'frontend-logo', data: { fileKey: 'logos/legacy.png' } });

    const result = await FileService.getLogo(repo);

    expect(mockStorageRead).toHaveBeenCalledWith('logos/legacy.png');
    expect(result).toEqual({ buffer: original, fileKey: 'logos/legacy.png' });
  });
});
