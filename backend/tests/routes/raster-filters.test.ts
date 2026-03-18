import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addRasterMappings, addRasterFilters } from '../helper';

describe('Testing /raster-filters routes', () => {
  beforeEach(async () => {
    await addRasterFilters();
  });

  it('GET /raster-filters responds with the list of expected raster-filters', async () => {
    const res = await request(app).get('/raster-filters');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Filter should be disabled
    expect(res.body[0].enabled).toBeFalsy();
    // Raster filters should have string IDs
    const ids = res.body.map((item: any) => item.id);
    ids.forEach((id: string) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  it('GET /raster-filters/:rasterFilterId responds with the expected raster filter', async () => {
    const listRes = await request(app).get('/raster-filters');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const rasterFilterId = listRes.body[0].id;
    const res = await request(app).get(`/raster-filters/${rasterFilterId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', rasterFilterId);
    expect(res.body).toHaveProperty('name');
  });

  it('GET /raster-filters responds with 404 if raster filter does not exist', async () => {
    const res = await request(app).get(`/raster-filters/non-existent-raster-filter`);
    expect(res.statusCode).toBe(404);
  });

  it.each(['land_cover', 'soil_groups'])('Raster filter is enabled after adding mappings to it', async (filterId: string) => {
    const res = await request(app).get(`/raster-filters/${filterId}`);
    expect(res.body.enabled).toBeFalsy();
    await addRasterMappings();
    const resAfter = await request(app).get(`/raster-filters/${filterId}`);
    expect(resAfter.body.enabled).toBeTruthy();
  });
});
