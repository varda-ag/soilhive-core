import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';

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
});
