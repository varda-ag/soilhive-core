import { describe, it, expect, afterEach } from '@jest/globals';
import ConfigService from '../../src/services/ConfigService';

describe('ConfigService.getMaxUploadSizeBytes', () => {
  const originalValue = process.env.MAX_UPLOAD_SIZE_MB;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.MAX_UPLOAD_SIZE_MB;
    } else {
      process.env.MAX_UPLOAD_SIZE_MB = originalValue;
    }
  });

  it('returns MAX_UPLOAD_SIZE_MB converted to bytes when set', () => {
    process.env.MAX_UPLOAD_SIZE_MB = '10';
    expect(ConfigService.getMaxUploadSizeBytes()).toBe(10 * 1024 * 1024);
  });

  it('defaults to 500MB when unset', () => {
    delete process.env.MAX_UPLOAD_SIZE_MB;
    expect(ConfigService.getMaxUploadSizeBytes()).toBe(500 * 1024 * 1024);
  });

  it('defaults to 500MB when invalid', () => {
    process.env.MAX_UPLOAD_SIZE_MB = 'not-a-number';
    expect(ConfigService.getMaxUploadSizeBytes()).toBe(500 * 1024 * 1024);
  });
});

describe('ConfigService.getPublicStorageConfig', () => {
  const originalStorageMode = process.env.STORAGE_MODE;
  const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const originalRegion = process.env.S3_STORAGE_REGION;
  const originalBucket = process.env.S3_STORAGE_BUCKET;
  const originalRootFolder = process.env.S3_STORAGE_ROOT_FOLDER;
  const originalMaxUploadSizeMB = process.env.MAX_UPLOAD_SIZE_MB;

  afterEach(() => {
    process.env.STORAGE_MODE = originalStorageMode;
    process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
    process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
    process.env.S3_STORAGE_REGION = originalRegion;
    process.env.S3_STORAGE_BUCKET = originalBucket;
    process.env.S3_STORAGE_ROOT_FOLDER = originalRootFolder;
    process.env.MAX_UPLOAD_SIZE_MB = originalMaxUploadSizeMB;
  });

  it('returns only storageMode and maxUploadSizeMB', () => {
    process.env.STORAGE_MODE = 'local';
    process.env.MAX_UPLOAD_SIZE_MB = '10';

    expect(ConfigService.getPublicStorageConfig()).toStrictEqual({
      storageMode: 'local',
      maxUploadSizeMB: 10,
    });
  });

  it('never includes credentials/bucketName/region even when STORAGE_MODE=s3 is configured with those set', () => {
    process.env.STORAGE_MODE = 's3';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.S3_STORAGE_REGION = 'eu-central-1';
    process.env.S3_STORAGE_BUCKET = 'test-bucket';
    process.env.S3_STORAGE_ROOT_FOLDER = 'root';

    const config = ConfigService.getPublicStorageConfig();

    expect(config).toStrictEqual({
      storageMode: 's3',
      maxUploadSizeMB: 500,
    });
    expect(JSON.stringify(config)).not.toContain('credentials');
    expect(JSON.stringify(config)).not.toContain('bucketName');
    expect(JSON.stringify(config)).not.toContain('region');
  });
});
