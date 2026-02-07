import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';

describe('Testing /soil-properties routes', () => {
  beforeEach(async () => {
    await addSyntheticData({ ...syntheticDataOptions, soilPropertyNames: ['ph', 'oc'] });
  });

  it('GET /soil-properties responds with the list of expected soil properties', async () => {
    const res = await request(app).get('/soil-properties');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const ids = res.body.map((item: any) => item.id);
    expect(ids).toContain('ph');
    expect(ids).toContain('oc');
  });

  it.each(['ph', 'oc'])('GET /soil-properties/:soilPropertyId responds with the expected soil property', async id => {
    const res = await request(app).get(`/soil-properties/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', id);
    expect(res.body).toHaveProperty('property_name', id);
  });

  it('GET /soil-properties responds with 404 if soil property does not exist', async () => {
    const res = await request(app).get(`/soil-properties/wrong`);
    expect(res.statusCode).toBe(404);
  });
});
