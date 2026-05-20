import { validate } from 'uuid';
import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addCategory, addSoilProperty, addUnitConversion, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getDataSource } from '../../src/utils/data-source';
import SoilPropertyEntity from '../../src/entities/SoilProperty';
import { UnitConversionType } from '../../src/types/data';

describe('Testing /soil-properties routes', () => {
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

  it('GET /soil-properties responds with the list of expected soil properties', async () => {
    const res = await request(app).get('/soil-properties');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    const ids = res.body.map((item: any) => item.id);
    expect(ids).toContain('ph');
    expect(ids).toContain('oc');
    const categories = res.body.map((item: any) => item.category_id);
    categories.forEach((categoryId: string) => {
      const isValidUUID = validate(categoryId);
      expect(isValidUUID).toBeFalsy();
    });
  });

  it.each(['ph', 'oc'])('GET /soil-properties/:soilPropertyId responds with the expected soil property', async id => {
    const res = await request(app).get(`/soil-properties/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', id);
    expect(res.body).toHaveProperty('property_name', id);
    const isValidUUID = validate(res.body.category_id);
    expect(isValidUUID).toBeFalsy();
  });

  it('GET /soil-properties responds with 404 if soil property does not exist', async () => {
    const res = await request(app).get(`/soil-properties/wrong`);
    expect(res.statusCode).toBe(404);
  });

  it('GET /soil-properties with a nested property contains a slug in parent_property_id', async () => {
    // Getting the nested property and checking the parent_property_id is a slug
    const res = await request(app).get(`/soil-properties`);
    expect(res.statusCode).toBe(200);
    const nestedProperty = res.body.find((item: any) => item.id === 'nested');
    expect(nestedProperty).toHaveProperty('parent_property_id', 'ph');
  });

  it('GET /soil-properties/:soilPropertyId with a nested property contains a slug in parent_property_id', async () => {
    // Getting the nested property and checking the parent_property_id is a slug
    const res = await request(app).get(`/soil-properties/nested`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 'nested');
    expect(res.body).toHaveProperty('parent_property_id', 'ph');
  });

  it('GET /soil-properties returns an empty original_units_of_measurement for properties with no unit conversions', async () => {
    const res = await request(app).get('/soil-properties');
    expect(res.statusCode).toBe(200);
    for (const property of res.body) {
      expect(property).toHaveProperty('original_units_of_measurement');
      expect(property.original_units_of_measurement).toEqual({});
    }
  });

  it('GET /soil-properties returns original_units_of_measurement for properties that have unit conversions', async () => {
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(SoilPropertyEntity);
    const ph = await repo.findOneOrFail({ where: { slug: 'ph' } });
    await addUnitConversion(ph.id, 'mg/kg', undefined, UnitConversionType.IDENTITY);
    await addUnitConversion(ph.id, 'g/kg', undefined, UnitConversionType.IDENTITY);

    const res = await request(app).get('/soil-properties');
    expect(res.statusCode).toBe(200);
    const phProperty = res.body.find((p: any) => p.id === 'ph');
    expect(phProperty.original_units_of_measurement).toMatchObject({ 'ph-mg-kg': 'mg/kg', 'ph-g-kg': 'g/kg' });
  });

  it('GET /soil-properties/:soilPropertyId returns original_units_of_measurement (but not CONDITIONAL type ones)', async () => {
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(SoilPropertyEntity);
    const ph = await repo.findOneOrFail({ where: { slug: 'ph' } });
    await addUnitConversion(ph.id, 'cmol/kg', undefined, UnitConversionType.IDENTITY);
    await addUnitConversion(ph.id, 'mg/dm3', 'x / BD', UnitConversionType.CONDITIONAL);

    const res = await request(app).get('/soil-properties/ph');
    expect(res.statusCode).toBe(200);
    expect(res.body.original_units_of_measurement).toEqual({ 'ph-cmol-kg': 'cmol/kg' });
  });
});
