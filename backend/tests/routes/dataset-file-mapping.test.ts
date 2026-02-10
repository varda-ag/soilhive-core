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
});
