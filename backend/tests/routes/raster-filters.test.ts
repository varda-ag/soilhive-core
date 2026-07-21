import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addRasterFilterMappings, addRasterFilters, getDataAdminToken } from '../helper';
import { IncomingHttpHeaders } from 'http';

describe('Testing /raster-filters routes', () => {
  let dataAdminAuthHeader: IncomingHttpHeaders;

  beforeAll(async () => {
    const token = await getDataAdminToken();
    dataAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

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
    // Filter should be active by default
    expect(res.body[0].active).toBe(true);
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
    expect(res.body).toHaveProperty('active', true);
  });

  it('GET /raster-filters responds with 404 if raster filter does not exist', async () => {
    const res = await request(app).get(`/raster-filters/non-existent-raster-filter`);
    expect(res.statusCode).toBe(404);
  });

  it.each(['land_cover', 'soil_groups'])('Raster filter is enabled after adding mappings to it', async (filterId: string) => {
    const res = await request(app).get(`/raster-filters/${filterId}`);
    expect(res.body.enabled).toBeFalsy();
    await addRasterFilterMappings();
    const resAfter = await request(app).get(`/raster-filters/${filterId}`);
    expect(resAfter.body.enabled).toBeTruthy();
  });

  describe('PATCH /raster-filters/:rasterFilterId', () => {
    it('sets active to false and persists the change', async () => {
      const res = await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: false });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 'land_cover');
      expect(res.body.active).toBe(false);

      const getRes = await request(app).get('/raster-filters/land_cover');
      expect(getRes.body.active).toBe(false);
    });

    it('sets active back to true', async () => {
      await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: false });
      const res = await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.active).toBe(true);
    });

    it('ignores unknown fields in the body and only updates active', async () => {
      const res = await request(app)
        .patch('/raster-filters/land_cover')
        .set(dataAdminAuthHeader)
        .send({ active: false, name: 'Should not change', mappings: { foo: 1 } });
      expect(res.statusCode).toBe(200);
      expect(res.body.active).toBe(false);
      expect(res.body.name).toBe('Land cover');
      expect(res.body.mappings).toBeNull();
    });

    it('responds with 404 if the raster filter does not exist', async () => {
      const res = await request(app).patch('/raster-filters/non-existent-raster-filter').set(dataAdminAuthHeader).send({ active: false });
      expect(res.statusCode).toBe(404);
    });

    it('responds with 401 without authorization', async () => {
      const res = await request(app).patch('/raster-filters/land_cover').send({ active: false });
      expect(res.statusCode).toBe(401);
    });
  });
});
