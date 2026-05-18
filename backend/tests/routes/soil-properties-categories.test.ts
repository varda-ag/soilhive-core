import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addCategory, addSoilProperty, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataSource } from '../../src/utils/data-source';
import SoilPropertyEntity from '../../src/entities/SoilProperty';

describe('Testing /soil-property-categories routes', () => {
  beforeEach(async () => {
    await addSyntheticData({ ...syntheticDataOptions, soilPropertyNames: ['ph', 'oc'] });
    // Creating a nested soil property
    const category = await addCategory(`test_category_soil_props`);
    const nested = await addSoilProperty('nested', category.id, 'kg');
    const dataSource = await getDataSource();
    // Search existing soil properties to get a valid parent_property_id, then update the nested property
    const repo = dataSource.getRepository(SoilPropertyEntity);
    const ph = await repo.findOneOrFail({ where: { slug: 'ph' } });
    await repo.update({ id: nested.id }, { parent_property_id: ph.id });
  });

  it('GET /soil-property-categories responds with the list of expected soil property categories', async () => {
    const res = await request(app).get('/soil-property-categories');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Categories should have string IDs (slugs)
    const ids = res.body.map((item: any) => item.id);
    ids.forEach((id: string) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
    expect(ids).toContain('test_category_soil_props');
  });

  it('GET /soil-property-categories/:soilPropertyCategoryId responds with the expected soil property category', async () => {
    const listRes = await request(app).get('/soil-property-categories');
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const categoryId = listRes.body[0].id;
    const res = await request(app).get(`/soil-property-categories/${categoryId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', categoryId);
    expect(res.body).toHaveProperty('category_name');
  });

  it('GET /soil-property-categories responds with 404 if soil property category does not exist', async () => {
    const res = await request(app).get(`/soil-property-categories/non-existent-category`);
    expect(res.statusCode).toBe(404);
  });
});
