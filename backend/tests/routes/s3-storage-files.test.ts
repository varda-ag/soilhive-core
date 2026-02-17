import { describe, it, expect, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import path from 'path';
import request from 'supertest';
import fs from 'fs';
import { app } from '../../src/app';
import * as gdal from 'gdal-async';
import { getDataAdminToken } from '../helper';
import { IngestionStatus } from '../../src/types/data';
import { StatusCodes } from 'http-status-codes';
import FileService from '../../src/services/FileService';

// Use absolute path from package root
const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
const fileName = 'sample_point.geojson';

describe('Testing /files routes (s3 storage)', () => {
  let dataAdminAuthHeader: IncomingHttpHeaders;
  const setS3TestEnv = () => {
    process.env.STORAGE_MODE = 's3';
    gdal.config.set('AWS_VIRTUAL_HOSTING', process.env.AWS_VIRTUAL_HOSTING ? process.env.AWS_VIRTUAL_HOSTING : null);
    gdal.config.set('AWS_HTTPS', process.env.AWS_HTTPS ? process.env.AWS_HTTPS : null);
  };
  setS3TestEnv();

  beforeAll(async () => {
    // Get data admin token
    const token = await getDataAdminToken();
    dataAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  describe('S3 storage upload', () => {
    it('uploads file to s3', async () => {
      setS3TestEnv();
      const res = await request(app)
        .post('/files')
        .set(dataAdminAuthHeader)
        .attach('file', Buffer.from(fs.readFileSync(`${vectorFilesPassPath}/${fileName}`)), fileName);
      expect(res.statusCode).toBe(StatusCodes.CREATED);

      expect(res.body.name).toBe(fileName);
      expect(res.body.metadata).toBeDefined();
      expect(res.body.file_path).toBeDefined();
      expect(res.body.status).toBe(IngestionStatus.PENDING);

      const fileService = new FileService();
      expect(fileService.exists(`${vectorFilesPassPath}/${res.body.file_path}`)).toBeTruthy();
    });
  });
});
