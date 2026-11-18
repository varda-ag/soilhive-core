import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';

describe('Testing /mappings routes', () => {
  describe('POST /mappings', () => {
    it('should create a new data mapping successfully (201)', async () => {
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

      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('data_mapping');
      expect(res.body.data_mapping).toHaveProperty('magnesium');
      expect(res.body.data_mapping).toHaveProperty('total_nitrogen');
      expect(res.body.data_mapping.upper_depth).toBe('min_depth');
    });

    it('should be idempotent: returning the same ID when the same payload is sent twice', async () => {
      const token = await getDataAdminToken();
      const payload = {
        iron: {
          property_id: 'iron',
          conversion_id: 'mg/kg',
        },
        upper_depth: 'top',
      };

      const res1 = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res1.statusCode).toBe(StatusCodes.CREATED);
      const firstId = res1.body.id;

      // send identical payload
      const res2 = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      // status is still 200 (not 409 Conflict or 500 Error)
      expect(res2.statusCode).toBe(StatusCodes.CREATED);

      expect(res2.body.id).toBe(firstId);

      expect(res2.body.data_mapping_hash).toBe(res1.body.data_mapping_hash);
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

      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body).toHaveProperty('detail');
      expect(res.body).toHaveProperty('errors');
    });

    it('should return 400 Bad Request when two columns are mapped to the same property, procedure and unit', async () => {
      const token = await getDataAdminToken();
      const payload = {
        fe_lab: { property_id: 'iron', conversion_id: 'mg/kg' },
        fe_field: { property_id: 'iron', conversion_id: 'mg/kg' },
        upper_depth: 'min_depth',
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.detail).toContain("'fe_lab' and 'fe_field'");
    });

    it('should accept two columns of one property that differ in unit or procedure', async () => {
      const token = await getDataAdminToken();
      const payload = {
        fe_ppm: { property_id: 'iron', conversion_id: 'ppm' },
        fe_mg_kg: { property_id: 'iron', conversion_id: 'mg/kg' },
        fe_olsen: { property_id: 'iron', conversion_id: 'mg/kg', procedure_id: 'olsen' },
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.CREATED);
    });

    it('should accept two bands of one property in a band mapping', async () => {
      const token = await getDataAdminToken();
      // As the raster mapping step sends them: both depths on every mapped band, no null conversion_id
      const payload = {
        '1': { property_id: 'iron', conversion_id: 'mg/kg', min_depth: 0, max_depth: 30 },
        '2': { property_id: 'iron', conversion_id: 'mg/kg', min_depth: 30, max_depth: 60 },
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.CREATED);
    });

    it('should accept bands of one property whose depths are null', async () => {
      const token = await getDataAdminToken();
      const payload = {
        '1': { property_id: 'iron', conversion_id: null, min_depth: null, max_depth: null, reference_period_start: '2020-01-01' },
        '2': { property_id: 'iron', conversion_id: null, min_depth: null, max_depth: null, reference_period_start: '2021-01-01' },
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.CREATED);
    });

    it('should tell the caller to send the depth keys when bands of one property leave them out', async () => {
      const token = await getDataAdminToken();
      const payload = {
        '1': { property_id: 'iron', conversion_id: 'mg/kg' },
        '2': { property_id: 'iron', conversion_id: 'mg/kg' },
      };

      const res = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.detail).toContain('send min_depth and max_depth on each band');
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

      expect(getRes.statusCode).toBe(StatusCodes.OK);
      expect(getRes.body.data_mapping).toEqual(createPayload);
    });

    it('should return 404 when mapping does not exist', async () => {
      const token = await getDataAdminToken();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app).get(`/mappings/${fakeId}`).set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('should return 401 Unauthorized when no token is provided', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app).get(`/mappings/${fakeId}`);

      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });

  describe('DELETE /mappings/:mappingId', () => {
    describe('DELETE /mappings/:id', () => {
      it('should return 204 when successfully deleted', async () => {
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

        const setupRes = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(payload);

        const id = setupRes.body.id;

        const deleteRes = await request(app).delete(`/mappings/${id}`).set('Authorization', `Bearer ${token}`);

        expect(deleteRes.statusCode).toBe(StatusCodes.NO_CONTENT);

        // verify GET now returns 404
        const getRes = await request(app).get(`/mappings/${id}`).set('Authorization', `Bearer ${token}`);
        expect(getRes.statusCode).toBe(StatusCodes.NOT_FOUND);
      });
    });
  });
});
