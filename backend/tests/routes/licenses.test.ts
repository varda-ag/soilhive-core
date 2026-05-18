import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataAdminToken } from '../helper';
import StatusCodes from 'http-status-codes';

describe('Testing /licenses routes', () => {
  beforeEach(async () => {
    await addSyntheticData({ ...syntheticDataOptions });
  });

  it('GET /licenses responds with the list of expected licenses', async () => {
    const res = await request(app).get('/licenses');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Licenses should have string IDs (slugs)
    const ids = res.body.map((item: any) => item.id);
    ids.forEach((id: string) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  it('GET /licenses/:licenseId responds with the expected license', async () => {
    const listRes = await request(app).get('/licenses');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const licenseId = listRes.body[0].id;
    const res = await request(app).get(`/licenses/${licenseId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', licenseId);
    expect(res.body).toHaveProperty('name');
  });

  it('GET /licenses responds with 404 if license does not exist', async () => {
    const res = await request(app).get(`/licenses/non-existent-license`);
    expect(res.statusCode).toBe(404);
  });

  describe('POST /licenses', () => {
    it('creates a license with name only', async () => {
      const token = await getDataAdminToken();
      const res = await request(app).post('/licenses').set('Authorization', `Bearer ${token}`).send({ name: 'CC-BY-4.0' });
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body).toHaveProperty('name', 'CC-BY-4.0');
      expect(res.body).toHaveProperty('id');
    });

    it('creates a license with all optional fields', async () => {
      const token = await getDataAdminToken();
      const res = await request(app)
        .post('/licenses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'MIT', full_name: 'MIT License', url: 'https://opensource.org/licenses/MIT' });
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body).toHaveProperty('name', 'MIT');
      expect(res.body).toHaveProperty('full_name', 'MIT License');
      expect(res.body).toHaveProperty('url', 'https://opensource.org/licenses/MIT');
    });

    it('responds with 401 when no token is provided', async () => {
      const res = await request(app).post('/licenses').send({ name: 'Apache-2.0' });
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('responds with 400 when name is missing', async () => {
      const token = await getDataAdminToken();
      const res = await request(app).post('/licenses').set('Authorization', `Bearer ${token}`).send({});
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('responds with 409 when a license with the same name already exists', async () => {
      const token = await getDataAdminToken();
      await request(app).post('/licenses').set('Authorization', `Bearer ${token}`).send({ name: 'GPL-3.0' });
      const res = await request(app).post('/licenses').set('Authorization', `Bearer ${token}`).send({ name: 'GPL-3.0' });
      expect(res.statusCode).toBe(StatusCodes.CONFLICT);
    });
  });
});
