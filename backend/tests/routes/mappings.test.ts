import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataAdminToken } from '../helper';

describe('Testing /mappings routes', () => {
  describe('POST /mappings', () => {
    it('should create a new data mapping successfully (200)', async () => {
      const token = await getDataAdminToken();
      const payload = {
        magnesium: {
          property_id: 'magnesium',
          procedure_id: 'sieved-over-2-mm-sieve-lab-procedure-water-h2o--01-05-weight-volume-electrode',
          conversion_id: 'cm',
        },
        total_nitrogen: {
          property_id: 'nitrogen-total',
        },
        upper_depth: 'min_depth',
        lower_depth: 'max_depth',
        date: 'sampling_date',
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('data_mapping');
      expect(res.body).toHaveProperty('data_mapping_hash');
      expect(res.body).toHaveProperty('created_at');
      expect(res.body).toHaveProperty('created_by');
      expect(res.body.data_mapping).toHaveProperty('magnesium');
      expect(res.body.data_mapping).toHaveProperty('total_nitrogen');
      expect(res.body.data_mapping.upper_depth).toBe('min_depth');
    });

    it('should return 400 Bad Request when mapping property has no id', async () => {
      const token = await getDataAdminToken();
      const payload = {
        magnesium: {
          // property_id: 'magnesium', <-- missing
          procedure_id: 'sieved-over-2-mm-sieve-lab-procedure-water-h2o--01-05-weight-volume-electrode',
          conversion_id: 'cm',
        },
        total_nitrogen: {
          property_id: 'nitrogen-total',
        },
        upper_depth: 'min_depth',
        lower_depth: 'max_depth',
        date: 'sampling_date',
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('detail');
      expect(res.body).toHaveProperty('errors');
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const payload = {
        total_nitrogen: {
          property_id: 'nitrogen-total',
        },
      };

      const res = await request(app).post('/mappings').send(payload);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /mappings/:mappingId', () => {
    it('should retrieve an existing data mapping successfully (200)', async () => {
      const token = await getDataAdminToken();

      // First create a mapping
      const createPayload = {
        magnesium: {
          property_id: 'magnesium',
          conversion_id: 'cm',
        },
        upper_depth: 'min_depth',
      };

      const postRes = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(createPayload);

      const mappingId = postRes.body.id;

      // Now retrieve it
      const getRes = await request(app).get(`/mappings/${mappingId}`).set('Authorization', `Bearer ${token}`);

      expect(getRes.statusCode).toBe(200);
      expect(getRes.body).toHaveProperty('id', mappingId);
      expect(getRes.body).toHaveProperty('data_mapping');
      expect(getRes.body.data_mapping).toHaveProperty('magnesium');
      expect(getRes.body.data_mapping.upper_depth).toBe('min_depth');
    });

    it('should return 404 when mapping does not exist', async () => {
      const token = await getDataAdminToken();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app).get(`/mappings/${fakeId}`).set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app).get(`/mappings/${fakeId}`);

      expect(res.statusCode).toBe(401);
    });
  });
});
