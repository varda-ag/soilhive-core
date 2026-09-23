import { describe, it, expect, afterEach, beforeAll } from '@jest/globals';
import { EntityManager } from 'typeorm';
import ConfigService from '../../src/services/ConfigService';
import { S3StorageConfig } from '../../src/interfaces/StorageConfig';
import { RequestData } from '../../src/interfaces/RequestData';
import { getEntityManager } from '../../src/utils/data-source';
import { Token } from '../../src/interfaces/Token';
import { Capability } from '../../src/types/enums';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

const otherToken: Token = {
  sub: 'other-user-id',
  email: 'other@example.com',
  scope: 'user',
  raw: 'other-mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

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

describe('ConfigService config value entitlements', () => {
  let entityManager: EntityManager;
  const service = new ConfigService();

  beforeAll(async () => {
    entityManager = await getEntityManager();
  });

  const buildRequestData = (overrides: Partial<RequestData> = {}): RequestData => ({
    entityManager,
    token: mockToken,
    entitlements: {},
    ...overrides,
  });

  describe('getConfig', () => {
    const configKey = 'test-config-key';

    it('rejects a non-privileged caller with no capability for the config', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });

      await expect(service.getConfig(buildRequestData(), configKey)).rejects.toMatchObject({ status: 403 });
    });

    it('allows a non-privileged caller holding READ for the config', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });
      const rd = buildRequestData({ entitlements: { configs: { [configKey]: [Capability.READ] } } });

      await expect(service.getConfig(rd, configKey)).resolves.toEqual({ some: 'value' });
    });

    it('allows an anonymous caller covered by an EVERYONE READ grant', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });
      const rd = buildRequestData({ token: undefined, entitlements: { configs: { [configKey]: [Capability.READ] } } });

      await expect(service.getConfig(rd, configKey)).resolves.toEqual({ some: 'value' });
    });

    it('rejects an anonymous caller with no EVERYONE grant for the config', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: configKey, data: { some: 'value' } });
      const rd = buildRequestData({ token: undefined, entitlements: {} });

      await expect(service.getConfig(rd, configKey)).rejects.toMatchObject({ status: 403 });
    });

    it('allows a privileged caller regardless of capability, throwing 404 for a missing config', async () => {
      const rd = buildRequestData({ token: { ...mockToken, isSuperAdmin: true } });

      await expect(service.getConfig(rd, configKey)).rejects.toMatchObject({ status: 404 });
    });

    // Existence is checked before entitlement: a missing id 404s for any caller, entitled or
    // not, rather than 403ing first. A fresh plugin: config (nobody holds a grant on it yet) is
    // the common case here — 403 isn't special-cased by the frontend's notFoundAsNull and gets
    // retried by React Query's default retry, while 404 resolves to null in one request.
    it('throws 404, not 403, for a missing id, even for a non-privileged caller with no entitlement', async () => {
      const rd = buildRequestData();

      await expect(service.getConfig(rd, 'missing-and-unentitled')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getConfigs', () => {
    it('omits ids the caller lacks READ/WRITE on, keeping the ones they can read', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'readable', data: { a: 1 } });
      await entityManager.getRepository('JsonStorage').save({ id: 'unreadable', data: { b: 2 } });
      const rd = buildRequestData({ entitlements: { configs: { readable: [Capability.READ] } } });

      await expect(service.getConfigs(rd, ['readable', 'unreadable', 'missing'])).resolves.toEqual({ readable: { a: 1 } });
    });

    it('returns every requested id for a privileged caller', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'a', data: { a: 1 } });
      await entityManager.getRepository('JsonStorage').save({ id: 'b', data: { b: 2 } });
      const rd = buildRequestData({ token: { ...mockToken, isSuperAdmin: true } });

      await expect(service.getConfigs(rd, ['a', 'b'])).resolves.toEqual({ a: { a: 1 }, b: { b: 2 } });
    });
  });

  describe('putConfig', () => {
    it('allows a privileged caller to upsert regardless of grants', async () => {
      const rd = buildRequestData({ token: { ...mockToken, isSuperAdmin: true } });

      await expect(service.putConfig(rd, 'system-config', { v: 1 })).resolves.toEqual({ v: 1 });
    });

    it('allows a non-privileged caller holding an existing WRITE grant to update', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'plugin:acme:widget', data: { v: 1 } });
      const rd = buildRequestData({ entitlements: { configs: { 'plugin:acme:widget': [Capability.WRITE] } } });

      await expect(service.putConfig(rd, 'plugin:acme:widget', { v: 2 })).resolves.toEqual({ v: 2 });
    });

    it('rejects a non-privileged caller with no grant on a non-plugin (system) id, even when unclaimed', async () => {
      const rd = buildRequestData();

      await expect(service.putConfig(rd, 'theme', { v: 1 })).rejects.toMatchObject({ status: 403 });
      const row = await entityManager.getRepository('JsonStorage').findOneBy({ id: 'theme' });
      expect(row).toBeNull();
    });

    it('claims a fresh plugin: id on first access and grants the caller WRITE on it', async () => {
      const rd = buildRequestData();

      await expect(service.putConfig(rd, 'plugin:acme:widget', { v: 1 })).resolves.toEqual({ v: 1 });

      const entitlements = await entityManager.query(`SELECT data->'configs' AS configs FROM entitlements WHERE id = $1`, [
        mockToken.email,
      ]);
      expect(entitlements[0].configs).toEqual({ 'plugin:acme:widget': ['write'] });
    });

    it('rejects a different non-privileged caller from claiming an id another caller already won', async () => {
      const winner = buildRequestData();
      await service.putConfig(winner, 'plugin:acme:widget', { v: 1 });

      const rd = buildRequestData({ token: otherToken });
      await expect(service.putConfig(rd, 'plugin:acme:widget', { v: 2 })).rejects.toMatchObject({ status: 403 });
      const row = await entityManager.getRepository('JsonStorage').findOneBy({ id: 'plugin:acme:widget' });
      expect(row?.data).toEqual({ v: 1 });
    });

    it('rejects a non-privileged caller reclaiming a plugin: id that was soft-deleted', async () => {
      const jsonStorageRepo = entityManager.getRepository('JsonStorage');
      await jsonStorageRepo.save({ id: 'plugin:acme:widget', data: { v: 1 } });
      await jsonStorageRepo.softDelete({ id: 'plugin:acme:widget' });

      const rd = buildRequestData();
      await expect(service.putConfig(rd, 'plugin:acme:widget', { v: 2 })).rejects.toMatchObject({ status: 403 });
    });

    it('only one of two concurrent first-access PUTs on the same fresh plugin: id wins; the other is rejected', async () => {
      const winnerRd = buildRequestData();
      const loserRd = buildRequestData({ token: otherToken });

      const results = await Promise.allSettled([
        service.putConfig(winnerRd, 'plugin:acme:race', { by: 'winner' }),
        service.putConfig(loserRd, 'plugin:acme:race', { by: 'loser' }),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 403 });

      // Only the winner's subject was granted WRITE.
      const allEntitlements = await entityManager.query(`SELECT id, data->'configs' AS configs FROM entitlements`);
      const grantors = allEntitlements.filter((row: { configs: Record<string, string[]> | null }) => row.configs?.['plugin:acme:race']);
      expect(grantors).toHaveLength(1);
    });
  });

  describe('deleteConfig', () => {
    it('allows a privileged caller to delete regardless of grants', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'test-config', data: { v: 1 } });
      const rd = buildRequestData({ token: { ...mockToken, isSuperAdmin: true } });

      await service.deleteConfig(rd, 'test-config');

      const row = await entityManager.getRepository('JsonStorage').findOneBy({ id: 'test-config' });
      expect(row).toBeNull();
    });

    it('allows a non-privileged caller holding WRITE to delete', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'plugin:acme:widget', data: { v: 1 } });
      const rd = buildRequestData({ entitlements: { configs: { 'plugin:acme:widget': [Capability.WRITE] } } });

      await service.deleteConfig(rd, 'plugin:acme:widget');

      const row = await entityManager.getRepository('JsonStorage').findOneBy({ id: 'plugin:acme:widget' });
      expect(row).toBeNull();
    });

    it('rejects a non-privileged caller with no WRITE grant', async () => {
      await entityManager.getRepository('JsonStorage').save({ id: 'plugin:acme:widget', data: { v: 1 } });
      const rd = buildRequestData();

      await expect(service.deleteConfig(rd, 'plugin:acme:widget')).rejects.toMatchObject({ status: 403 });
      const row = await entityManager.getRepository('JsonStorage').findOneBy({ id: 'plugin:acme:widget' });
      expect(row).not.toBeNull();
    });
  });
});
