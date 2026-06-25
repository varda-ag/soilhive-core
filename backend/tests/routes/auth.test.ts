import { describe, it, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { StatusCodes } from 'http-status-codes';
import AuthService from '../../src/services/AuthService';

const authService = new AuthService();

const postToken = (body: Record<string, string>) => request(app).post('/oauth/token').type('form').send(body);

const validBody = { grant_type: 'password', username: 'user', password: 'superadmin' };

describe('POST /oauth/token', () => {
  afterEach(() => {
    authService.resetAuthConfig();
  });

  it('returns 200 with a token for the super-admin password', async () => {
    const res = await postToken(validBody);

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(typeof res.body.access_token).toBe('string');
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(86400);
  });

  it('returns a token with super-admin and data-admin scopes for the super-admin password', async () => {
    const res = await postToken(validBody);

    const decoded = jwt.decode(res.body.access_token) as Record<string, string>;
    expect(decoded.scope).toBe('super-admin data-admin');
    expect(decoded.email).toBe('super-admin@localhost');
  });

  it('returns 200 with a token for the data-admin password', async () => {
    const res = await postToken({ ...validBody, password: 'dataadmin' });

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(typeof res.body.access_token).toBe('string');
  });

  it('returns a token with only data-admin scope for the data-admin password', async () => {
    const res = await postToken({ ...validBody, password: 'dataadmin' });

    const decoded = jwt.decode(res.body.access_token) as Record<string, string>;
    expect(decoded.scope).toBe('data-admin');
    expect(decoded.email).toBe('data-admin@localhost');
  });

  it('returns 401 for an incorrect password', async () => {
    const res = await postToken({ ...validBody, password: 'wrongpassword' });

    expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
  });

  it('returns 400 when grant_type is missing', async () => {
    const res = await postToken({ username: 'user', password: 'superadmin' });

    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
  });

  it('returns 400 when grant_type is not "password"', async () => {
    const res = await postToken({ ...validBody, grant_type: 'client_credentials' });

    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
  });

  it('returns 400 when password is not configured', async () => {
    const saved = {
      SUPER_ADMIN_PASSWORD_HASH: process.env.SUPER_ADMIN_PASSWORD_HASH,
      DATA_ADMIN_PASSWORD_HASH: process.env.DATA_ADMIN_PASSWORD_HASH,
    };
    delete process.env.SUPER_ADMIN_PASSWORD_HASH;
    delete process.env.DATA_ADMIN_PASSWORD_HASH;

    const res = await postToken(validBody);

    Object.assign(process.env, saved);
    expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
  });
});
