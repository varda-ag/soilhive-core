import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import FileService from '../../src/services/FileService';
import StatusCodes from 'http-status-codes';
import { createSignedPath } from '../../src/utils/presigned-url';
import { sleep } from '../../src/utils/utils';

describe('Testing /download route', () => {
  it('should return 400 (bad request) if no token is provided', async () => {
    const fileId = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(fileId, 'some content');

    const response = await request(app).get(`/downloads/${fileId}`);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it('should return 401 (unauthorized) if invalid token is provided ', async () => {
    const fileId = 'test-file';

    const invalidToken = 'invalidtoken';

    const storage = FileService.getStorageEngine();

    await storage.write(fileId, 'some content');

    const response = await request(app).get(`/downloads/${fileId}?token=${invalidToken}`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('should return 200 (ok) if valid token is provided ', async () => {
    const fileId = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(fileId, 'some content');

    const validFilePath = createSignedPath(fileId);

    const response = await request(app).get(`/downloads/${validFilePath}`);

    expect(response.status).toBe(StatusCodes.OK);
  });

  it('should return 410 (gone) if expired token is provided ', async () => {
    const fileId = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(fileId, 'some content');

    const expiredFilePath = createSignedPath(fileId, 1); // just one second of validity

    // wait for 2 seconds to ensure the token is expired
    await sleep(2000);

    const response = await request(app).get(`/downloads/${expiredFilePath}`);

    expect(response.status).toBe(StatusCodes.GONE);
  });

  it('should return correct content-type for a csv file', async () => {
    const fileId = 'test-file.csv';

    const storage = FileService.getStorageEngine();
    await storage.write(fileId, 'col1,col2\nval1,val2');

    const validFilePath = createSignedPath(fileId);

    const response = await request(app).get(`/downloads/${validFilePath}`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toContain('text/csv');
  });
});
