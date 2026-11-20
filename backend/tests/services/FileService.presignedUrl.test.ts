import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type FileServiceType from '../../src/services/FileService';

// Credentials that expire like web identity ones, each issue under a new key
let minutesLeft = 60;
let issued = 0;
const fetchCredentials = jest.fn(async () => ({
  accessKeyId: `key-${++issued}`,
  secretAccessKey: 'secret',
  expiration: new Date(Date.now() + minutesLeft * 60_000),
}));

const signingKey = (url: string) => new URL(url).searchParams.get('X-Amz-Credential')?.split('/')[0];

describe('FileService.getPresignedUrl', () => {
  const original = { STORAGE_MODE: process.env.STORAGE_MODE, S3_STORAGE_REGION: process.env.S3_STORAGE_REGION };
  let FileService: typeof FileServiceType;
  let S3Client: jest.Mock;

  beforeEach(async () => {
    process.env.STORAGE_MODE = 's3';
    minutesLeft = 60;
    issued = 0;
    fetchCredentials.mockClear();
    // jest.beforeEach.ts has already loaded FileService through the app, so it is loaded again
    // with an S3Client that takes the credentials above
    jest.resetModules();
    jest.doMock('@aws-sdk/client-s3', () => {
      const actual = jest.requireActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
      return {
        ...actual,
        S3Client: jest.fn((config: any) => new actual.S3Client({ ...config, credentials: fetchCredentials })),
      };
    });
    S3Client = (await import('@aws-sdk/client-s3')).S3Client as unknown as jest.Mock;
    FileService = (await import('../../src/services/FileService')).default;
  });

  afterEach(() => {
    process.env.STORAGE_MODE = original.STORAGE_MODE;
    process.env.S3_STORAGE_REGION = original.S3_STORAGE_REGION;
  });

  it('signs every URL with one client, fetching its credentials once', async () => {
    const first = await FileService.getPresignedUrl('a.tif', 600);
    const second = await FileService.getPresignedUrl('b.tif', 600);

    expect(S3Client).toHaveBeenCalledTimes(1);
    expect(fetchCredentials).toHaveBeenCalledTimes(1);
    expect([signingKey(first), signingKey(second)]).toEqual(['key-1', 'key-1']);
    expect(new URL(first).searchParams.get('X-Amz-Expires')).toBe('600');
  });

  it('renews the credentials when they would expire before the URL', async () => {
    minutesLeft = 20;

    const short = await FileService.getPresignedUrl('a.tif', 15 * 60);
    const long = await FileService.getPresignedUrl('a.tif', 60 * 60);

    expect(signingKey(short)).toBe('key-1');
    expect(signingKey(long)).toBe('key-2');
  });

  it('builds a new client when the S3 config changes', async () => {
    await FileService.getPresignedUrl('a.tif');
    process.env.S3_STORAGE_REGION = 'eu-south-1';
    const url = await FileService.getPresignedUrl('a.tif');

    expect(S3Client).toHaveBeenCalledTimes(2);
    expect(new URL(url).searchParams.get('X-Amz-Credential')).toContain('/eu-south-1/');
  });
});
