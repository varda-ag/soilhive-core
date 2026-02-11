import { describe, it, expect } from '@jest/globals';
import { getDataAdminToken } from '../helper';
import request from 'supertest';
import { app } from '../../src/app';
import { StatusCodes } from 'http-status-codes';
import { addFile } from '../../src/utils/mock';

describe('Testing /datasets{datasetId}/dataset-file-mapping routes', () => {
  describe('POST /datasets{datasetId}/dataset-file-mapping', () => {
    it('should create an empty dataset file mapping successfully (201)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'New Unique Dataset',
        full_name: 'The Full Name Example',
      };

      const dataset = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(datasetPayload);

      const datasetFileMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(datasetFileMapping.statusCode).toBe(StatusCodes.CREATED);
      expect(datasetFileMapping.body.id).toBeDefined();
    });

    it('should create a dataset file mapping with mappingId (201)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'New Unique Dataset',
        full_name: 'The Full Name Example',
      };

      const dataset = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(datasetPayload);

      const mappingsPayload = {
        iron: {
          property_id: 'iron',
          conversion_id: 'mg/kg',
        },
        upper_depth: 'top',
      };

      const mapping = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(mappingsPayload);

      const datasetFileMappingPayload = {
        mappingId: `${mapping.body.id}`,
      };

      const datasetFileMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send(datasetFileMappingPayload);

      expect(datasetFileMapping.statusCode).toBe(StatusCodes.CREATED);
      expect(datasetFileMapping.body.mappingId).toBe(mapping.body.id);
    });

    it('should return 409 when creating a duplicate dataset file mapping', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'New Unique Dataset',
        full_name: 'The Full Name Example',
      };

      const dataset = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(datasetPayload);

      const mappingsPayload = {
        iron: {
          property_id: 'iron',
          conversion_id: 'mg/kg',
        },
        upper_depth: 'top',
      };

      const mapping = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(mappingsPayload);

      const file = await addFile('test-file');

      const datasetFileMappingPayload = {
        mappingId: mapping.body.id,
        fileID: file.id,
      };

      // Create the first mapping successfully
      const firstMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send(datasetFileMappingPayload);

      expect(firstMapping.statusCode).toBe(StatusCodes.CREATED);

      // Attempt to create a duplicate mapping with the same dataset, file, and mapping IDs
      const duplicateMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send(datasetFileMappingPayload);

      expect(duplicateMapping.statusCode).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('PATCH /datasets{datasetId}/dataset-file-mapping', () => {
    it('should update a dataset file mapping (200)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'New Unique Dataset',
        full_name: 'The Full Name Example',
      };

      const dataset = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(datasetPayload);

      const mappingsPayload = {
        iron: {
          property_id: 'iron',
          conversion_id: 'mg/kg',
        },
        upper_depth: 'top',
      };

      const mapping = await request(app).post('/mappings').set('Authorization', `Bearer ${token}`).send(mappingsPayload);

      // create with just the mapping id
      const datasetFileMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          mappingId: mapping.body.id,
        });

      expect(datasetFileMapping.statusCode).toBe(StatusCodes.CREATED);
      expect(datasetFileMapping.body.mappingId).toBe(mapping.body.id);

      const file = await addFile('test-file');

      // add the file id
      const datasetFileMappingUpdate = await request(app)
        .patch(`/datasets/${dataset.body.id}/dataset-file-mapping/${datasetFileMapping.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          fileID: file.id,
        });

      expect(datasetFileMappingUpdate.statusCode).toBe(StatusCodes.OK);
      expect(datasetFileMappingUpdate.body.mappingId).toBe(mapping.body.id);
      expect(datasetFileMappingUpdate.body.fileID).toBe(file.id);
    });
  });

  describe('GET /datasets/{datasetId}/dataset-file-mapping/{datasetFileMappingId}', () => {
    it('should get a specific dataset file mapping (200)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'Dataset for GET test',
        full_name: 'Full Name for GET',
      };

      const dataset = await request(app)
        .post('/datasets')
        .set('Authorization', `Bearer ${token}`)
        .send(datasetPayload);

      const datasetFileMapping = await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          iron: {
            property_id: 'iron',
            conversion_id: 'mg/kg',
          },
          upper_depth: 'top',
        });

      const getResponse = await request(app)
        .get(`/datasets/${dataset.body.id}/dataset-file-mapping/${datasetFileMapping.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getResponse.statusCode).toBe(StatusCodes.OK);
      expect(getResponse.body.id).toBe(datasetFileMapping.body.id);
    });
    it('should return 404 for non-existent mapping (404)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'Dataset for 404 test',
        full_name: 'Full Name for 404',
      };

      const dataset = await request(app)
        .post('/datasets')
        .set('Authorization', `Bearer ${token}`)
        .send(datasetPayload);

      const getResponse = await request(app)
        .get(`/datasets/${dataset.body.id}/dataset-file-mapping/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(getResponse.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
  });
  describe('GET /datasets/{datasetId}/dataset-file-mapping', () => {
    it('should get all mappings for a dataset (200)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'Dataset for GET all test',
        full_name: 'Full Name for GET all',
      };

      const dataset = await request(app)
        .post('/datasets')
        .set('Authorization', `Bearer ${token}`)
        .send(datasetPayload);

      await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          iron: {
            property_id: 'iron',
            conversion_id: 'mg/kg',
          },
          upper_depth: 'top',
        });

      await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          aluminium: {
            property_id: 'aluminium',
            conversion_id: 'mg/kg',
          },
          upper_depth: 'top',
        });

      const getResponse = await request(app)
        .get(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`);

      expect(getResponse.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(getResponse.body)).toBe(true);
      expect(getResponse.body.length).toBe(2);
    });
    it('should filter mappings by fileId query parameter (200)', async () => {
      const token = await getDataAdminToken();

      const datasetPayload = {
        name: 'Dataset for fileId filter',
        full_name: 'Full Name for fileId filter',
      };

      const dataset = await request(app)
        .post('/datasets')
        .set('Authorization', `Bearer ${token}`)
        .send(datasetPayload);

      const file = await addFile('filter-test-file');

      await request(app)
        .post(`/datasets/${dataset.body.id}/dataset-file-mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileID: file.id });

      const getResponse = await request(app)
        .get(`/datasets/${dataset.body.id}/dataset-file-mapping?fileId=${file.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getResponse.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(getResponse.body)).toBe(true);
      expect(getResponse.body.length).toBeGreaterThanOrEqual(1);
      expect(getResponse.body[0].fileID).toBe(file.id);
    });
  });
});
