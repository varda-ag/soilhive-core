import { describe, it, expect, afterEach } from '@jest/globals';
import ConfigService from '../../src/services/ConfigService';
import { S3StorageConfig } from '../../src/interfaces/StorageConfig';

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

describe('ConfigService.getStorageConfig', () => {
  const originalStorageMode = process.env.STORAGE_MODE;
  const originalPartSize = process.env.S3_STORAGE_PART_SIZE_MB;
  const originalQueueSize = process.env.S3_STORAGE_QUEUE_SIZE;

  afterEach(() => {
    process.env.STORAGE_MODE = originalStorageMode;
    process.env.S3_STORAGE_PART_SIZE_MB = originalPartSize;
    process.env.S3_STORAGE_QUEUE_SIZE = originalQueueSize;
  });

  it('returns defaults for uploadPartSizeBytes and uploadQueueSize when not set', () => {
    process.env.STORAGE_MODE = 's3';
    const storageConfig = ConfigService.getStorageConfig().config as S3StorageConfig;

    expect(storageConfig.uploadPartSizeBytes).toBe(64 * 1024 * 1024);
    expect(storageConfig.uploadQueueSize).toBe(4);
  });

  it.each([
    ['128MB', '-1'],
    ['4', '0'],
  ])('returns defaults for uploadPartSizeBytes and uploadQueueSize when invalid values are set', (partSizeMB, queueSize) => {
    process.env.STORAGE_MODE = 's3';
    process.env.S3_STORAGE_PART_SIZE_MB = partSizeMB;
    process.env.S3_STORAGE_QUEUE_SIZE = queueSize;

    const storageConfig = ConfigService.getStorageConfig().config as S3StorageConfig;

    expect(storageConfig.uploadPartSizeBytes).toBe(64 * 1024 * 1024);
    expect(storageConfig.uploadQueueSize).toBe(4);
  });

  it('returns set values for uploadPartSizeBytes and uploadQueueSize', () => {
    process.env.STORAGE_MODE = 's3';
    process.env.S3_STORAGE_PART_SIZE_MB = '128';
    process.env.S3_STORAGE_QUEUE_SIZE = '10';

    const storageConfig = ConfigService.getStorageConfig().config as S3StorageConfig;

    expect(storageConfig.uploadPartSizeBytes).toBe(128 * 1024 * 1024);
    expect(storageConfig.uploadQueueSize).toBe(10);
  });
});
