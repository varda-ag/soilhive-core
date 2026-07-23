import { describe, it, expect, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import path from 'path';
import request from 'supertest';
import fs from 'fs';
import { app } from '../../src/app';
import { getSuperAdminToken } from '../helper';
import { getDataSource } from '../../src/utils/data-source';
import FileService from '../../src/services/FileService';
import { StatusCodes } from 'http-status-codes';

const LOGO_ROW_ID = 'frontend-logo';
const logoFilePath = path.join(__dirname, '../assets/logo.png');
const fileService = new FileService();

const getLogoRow = async () => {
  const dataSource = await getDataSource();
  return dataSource.getRepository('JsonStorage').findOneBy({ id: LOGO_ROW_ID });
};

// Directly seed a legacy logo row (fileKey only, no bytes) plus a real file in storage,
// reproducing how logos were stored before ADR 0015.
const seedLegacyLogo = async (fileKey: string, contents: Buffer) => {
  await FileService.getStorageEngine().write(fileKey, contents);
  const dataSource = await getDataSource();
  await dataSource.getRepository('JsonStorage').save({ id: LOGO_ROW_ID, data: { fileKey } });
};

describe('Testing /frontend/logo routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  const uploadLogo = () =>
    request(app)
      .post('/frontend/logo')
      .set(superAdminAuthHeader)
      .attach('file', Buffer.from(fs.readFileSync(logoFilePath)), 'logo.png');

  it('Should store the logo bytes in the DB and remove the storage copy on upload', async () => {
    const original = fs.readFileSync(logoFilePath);

    const uploadResponse = await uploadLogo();
    expect(uploadResponse.status).toBe(StatusCodes.CREATED);

    const row = await getLogoRow();
    expect(row).not.toBeNull();
    expect(row!.data.fileKey).toBeDefined();
    expect(row!.data.bytes).toBeDefined();
    // Persisted bytes are the base64 of the uploaded file.
    expect(Buffer.from(row!.data.bytes, 'base64')).toEqual(original);

    // The storage copy written by multer was cleaned up: the DB is the source of truth.
    expect(await fileService.exists(row!.data.fileKey)).toBe(false);
  });

  it('Should serve the logo from the DB bytes', async () => {
    const original = fs.readFileSync(logoFilePath);
    await uploadLogo();

    const response = await request(app).get('/frontend/logo').responseType('blob');
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body).toEqual(original);
  });

  it('Should serve a legacy logo from storage when the DB row has no bytes', async () => {
    const legacyBytes = Buffer.from(fs.readFileSync(logoFilePath));
    await seedLegacyLogo('logos/legacy-logo.png', legacyBytes);

    const response = await request(app).get('/frontend/logo').responseType('blob');
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body).toEqual(legacyBytes);
  });

  it('Should return 404 when no logo is configured', async () => {
    const response = await request(app).get('/frontend/logo');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('Should delete a DB-backed logo without touching storage and return 404 afterwards', async () => {
    await uploadLogo();

    const deleteResponse = await request(app).delete('/frontend/logo').set(superAdminAuthHeader);
    expect(deleteResponse.status).toBe(StatusCodes.NO_CONTENT);

    expect(await getLogoRow()).toBeNull();

    const response = await request(app).get('/frontend/logo');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('Should delete a legacy logo and remove its storage file', async () => {
    const fileKey = 'logos/legacy-logo.png';
    await seedLegacyLogo(fileKey, Buffer.from(fs.readFileSync(logoFilePath)));

    const deleteResponse = await request(app).delete('/frontend/logo').set(superAdminAuthHeader);
    expect(deleteResponse.status).toBe(StatusCodes.NO_CONTENT);

    expect(await getLogoRow()).toBeNull();
    expect(await fileService.exists(fileKey)).toBe(false);

    const response = await request(app).get('/frontend/logo');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
