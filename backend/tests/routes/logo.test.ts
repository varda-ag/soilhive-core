import { describe, it, expect, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import path from 'path';
import request from 'supertest';
import fs from 'fs';
import { app } from '../../src/app';
import { getSuperAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';

describe('Testing /frontend/logo routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    // Get data admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it('Should return uploaded logo', async () => {
    const logoFile = path.join(__dirname, '../assets/logo.png');

    const uploadResponse = await request(app)
      .post('/frontend/logo')
      .set(superAdminAuthHeader)
      .attach('file', Buffer.from(fs.readFileSync(logoFile)), 'logo.png');
    expect(uploadResponse.status).toBe(StatusCodes.CREATED);

    const response = await request(app).get('/frontend/logo');
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers['content-type']).toContain('image/png');
  });

  it('Should return 404 after deleting custom logo', async () => {
    const logoFile = path.join(__dirname, '../assets/logo.png');

    await request(app)
      .post('/frontend/logo')
      .set(superAdminAuthHeader)
      .attach('file', Buffer.from(fs.readFileSync(logoFile)), 'logo.png');

    await request(app).delete('/frontend/logo').set(superAdminAuthHeader);

    const response = await request(app).get('/frontend/logo');
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
