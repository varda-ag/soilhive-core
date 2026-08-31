import { describe, it, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';

describe('Testing GET /storage/config', () => {
  const originalStorageMode = process.env.STORAGE_MODE;

  afterEach(() => {
    process.env.STORAGE_MODE = originalStorageMode;
  });

  it('responds 200 with only storageMode and maxUploadSizeMB, no auth header required', async () => {
    const res = await request(app).get('/storage/config');

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.body).toHaveProperty('storageMode');
    expect(res.body).toHaveProperty('maxUploadSizeMB');
    expect(JSON.stringify(res.body)).not.toContain('credentials');
  });

  it('omits every S3-specific field when STORAGE_MODE=s3 with AWS creds configured', async () => {
    process.env.STORAGE_MODE = 's3';

    const res = await request(app).get('/storage/config');

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.body).toStrictEqual({
      storageMode: 's3',
      maxUploadSizeMB: expect.any(Number),
    });
    expect(JSON.stringify(res.body)).not.toContain('credentials');
    expect(JSON.stringify(res.body)).not.toContain('bucketName');
    expect(JSON.stringify(res.body)).not.toContain('region');
  });
});
