import { jest, describe, it, expect, beforeAll, afterEach, beforeEach } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import path from 'path';
import request from 'supertest';
import fs from 'fs';
import { Readable } from 'stream';
import { app } from '../../src/app';
import { getDataAdminToken } from '../helper';
import { IngestionStatus } from '../../src/types/data';
import { StatusCodes } from 'http-status-codes';
import FileEntity from '../../src/entities/File';
import { getDataSource } from '../../src/utils/data-source';
import { addFile } from '../../src/utils/mock';
import { FileStorage } from '@flystorage/file-storage';
import FileService from '../../src/services/FileService';
import { createSignedPath } from '../../src/utils/presigned-url';
import { sleep } from '../../src/utils/utils';

// Use absolute path from package root
const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
const fakeId = '00000000-0000-0000-0000-000000000000';
const fileName = 'sample_point.geojson';

describe('Testing /files routes (local storage)', () => {
  let dataAdminAuthHeader: IncomingHttpHeaders;
  const setLocalStorageRootFolder = async (rootFolder: string) => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rootFolder;
  };
  setLocalStorageRootFolder(vectorFilesPassPath);

  beforeAll(async () => {
    // Get data admin token
    const token = await getDataAdminToken();
    dataAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Remove uploaded data
    const paths = fs.globSync(`${vectorFilesPassPath}/*/`);
    for (const path of paths) {
      fs.rmSync(path, { recursive: true });
    }
  });

  describe('POST /files', () => {
    beforeEach(() => {
      setLocalStorageRootFolder(vectorFilesPassPath);
    });
    it('uploads file and persists entity with correct path', async () => {
      const res = await request(app)
        .post('/files')
        .set(dataAdminAuthHeader)
        .attach('file', Buffer.from(fs.readFileSync(`${vectorFilesPassPath}/${fileName}`)), fileName);
      expect(res.statusCode).toBe(StatusCodes.CREATED);

      expect(res.body.name).toBe(fileName);
      expect(res.body.metadata).toBeDefined();
      expect(res.body.file_path).toBeDefined();
      expect(res.body.status).toBe(IngestionStatus.PENDING);

      expect(fs.existsSync(`${vectorFilesPassPath}/${res.body.file_path}`)).toBeTruthy();
    });
    it('Removes file entity and file from storage when upload fails', async () => {
      // Request should fail in extractMetadata function
      const res = await request(app).post('/files').set(dataAdminAuthHeader).attach('file', Buffer.from('bad data'), 'fail.gpkg');
      // Request fails
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);

      // Entity does not exist
      const dataSource = await getDataSource();
      const repo = dataSource.getRepository(FileEntity);
      const file = await repo.findOne({
        where: { name: 'fail.txt' },
      });
      expect(file).toBeNull();

      // File does not exist
      const matchingPaths = fs.globSync(`${vectorFilesPassPath}/*/*/*_fail.txt`);
      expect(matchingPaths.length).toBe(0);
    });

    it('rejects invalid multipart field', async () => {
      const res = await request(app).post('/files').set(dataAdminAuthHeader).attach('wrong', Buffer.from('x'), 'x.txt');
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app).post('/files').attach('file', Buffer.from('x'), 'x.txt');
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('GET /files/:fileId', () => {
    it('should retrieve an existing file successfully (200)', async () => {
      // First create a file
      const name = 'test_filename.txt';
      const file = await addFile(name);

      // Now retrieve it
      const res = await request(app).get(`/files/${file.slug}`).set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.name).toEqual(name);
    });

    it('should return 404 when file does not exist', async () => {
      const res = await request(app).get(`/files/${fakeId}`).set(dataAdminAuthHeader);

      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app).get(`/files/${fakeId}`);

      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('DELETE /files/:fileId', () => {
    it('should delete an existing file successfully (204)', async () => {
      const file = await addFile('to_delete.txt');

      const res = await request(app).delete(`/files/${file.slug}`).set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(StatusCodes.NO_CONTENT);
      expect(fs.existsSync(`${vectorFilesPassPath}/${file.file_path}`)).toBeFalsy();
    });
  });

  describe('GET /files/:fileId/download', () => {
    beforeEach(() => {
      setLocalStorageRootFolder(vectorFilesPassPath);
    });

    it('should retrieve an existing file successfully (200)', async () => {
      const json = '{"this": "must be valid JSON due to content-type detection"}';
      const mockStream = Readable.from([json]);

      jest.spyOn(FileStorage.prototype, 'read').mockResolvedValue(mockStream);
      // First create a file
      const file = await addFile(fileName);

      // Now retrieve it
      const res = await request(app).get(`/files/${file.slug}/download`).set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.text).toBe(json);
    });

    it('should raise error on stream error', async () => {
      const errorStream = new Readable({
        read() {
          this.destroy(new Error('Stream failed'));
        },
      });

      jest.spyOn(FileStorage.prototype, 'read').mockResolvedValue(errorStream);
      // First create a file
      const file = await addFile(fileName);

      // Now retrieve it
      const res = await request(app).get(`/files/${file.slug}/download`).set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(res.body.detail).toBe('Stream failed');
    });

    it('should return 404 when file does not exist', async () => {
      const res = await request(app).get(`/files/${fakeId}/download`).set(dataAdminAuthHeader);

      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app).get(`/files/${fakeId}/download`);

      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });
});

describe('Testing /download route', () => {
  it('should return 400 (bad request) if no token is provided', async () => {
    const filePath = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(filePath, 'some content');

    const response = await request(app).get(`/downloads/${filePath}`);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it('should return 401 (unauthorized) if invalid token is provided ', async () => {
    const filePath = 'test-file';

    const invalidToken = 'invalidtoken';

    const storage = FileService.getStorageEngine();

    await storage.write(filePath, 'some content');

    const response = await request(app).get(`/downloads/${filePath}?token=${invalidToken}`);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('should return 200 (ok) if valid token is provided ', async () => {
    const filePath = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(filePath, 'some content');

    const validFilePath = createSignedPath(filePath);

    const response = await request(app).get(`/downloads/${validFilePath}`);

    expect(response.status).toBe(StatusCodes.OK);
  });

  it('should return 410 (gone) if expired token is provided ', async () => {
    const filePath = 'test-file';

    const storage = FileService.getStorageEngine();

    await storage.write(filePath, 'some content');

    const expiredFilePath = createSignedPath(filePath, 1); // just one second of validity

    // wait for 2 seconds to ensure the token is expired
    await sleep(2000);

    const response = await request(app).get(`/downloads/${expiredFilePath}`);

    expect(response.status).toBe(StatusCodes.GONE);
  });

  it('should return correct content-type for a csv file', async () => {
    const filePath = 'test-file.csv';

    const storage = FileService.getStorageEngine();
    await storage.write(filePath, 'col1,col2\nval1,val2');

    const validFilePath = createSignedPath(filePath);

    const response = await request(app).get(`/downloads/${validFilePath}`);

    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toContain('text/csv');
  });
});
