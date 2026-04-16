import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { addSyntheticData, addSyntheticIngestionData, syntheticDataOptions, syntheticIngestionDataOptions } from '../../src/utils/mock';
import { getDataAdminToken } from '../helper';
import StatusCodes from 'http-status-codes';

describe('Testing /datasets routes', () => {
  describe('GET /datasets', () => {
    it('GET /datasets responds with the list of all available datasets', async () => {
      const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
      const s2 = await addSyntheticData({ ...syntheticDataOptions, id: 2, soilPropertyNames: ['oc'] });
      const res = await request(app).get('/datasets');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      const ids = res.body.map((item: any) => item.id);
      expect(ids).toContain(s1.dataset.slug);
      expect(ids).toContain(s2.dataset.slug);
    });

    it('GET /datasets/:datasetId responds with the expected dataset', async () => {
      const s1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['ph'] });
      const res = await request(app).get(`/datasets/${s1.dataset.slug}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toHaveProperty('id', s1.dataset.slug);
      expect(res.body).toHaveProperty('visibility', s1.dataset.visibility);
    });

    it('GET /datasets responds with 404 if dataset does not exist', async () => {
      const res = await request(app).get(`/datasets/wrong`);
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('GET /datasets/:datasetId responds with 301 when using an old slug', async () => {
      const token = await getDataAdminToken();

      const postRes = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send({ name: 'Redirect Me' });
      const oldSlug = postRes.body.id;

      const patchRes = await request(app)
        .patch(`/datasets/${oldSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Redirect Me Renamed' });
      const newSlug = patchRes.body.id;

      const res = await request(app).get(`/datasets/${oldSlug}`);
      expect(res.statusCode).toBe(StatusCodes.MOVED_PERMANENTLY);
      expect(res.headers.location).toBe(`/datasets/${newSlug}`);
    });
  });

  describe('POST /datasets', () => {
    it('should create a new dataset successfully (201)', async () => {
      const token = await getDataAdminToken();
      const payload = {
        name: 'New Unique Dataset',
        full_name: 'The Full Name Example',
      };

      const res = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body.name).toBe(payload.name);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('created_at');
    });

    it('should return 409 Conflict when creating a dataset with an existing name/slug', async () => {
      const token = await getDataAdminToken();
      const existingData = { name: 'duplicate_name' };

      // First creation
      await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(existingData);

      // Attempting to create the same name again
      const res = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(existingData);

      expect(res.statusCode).toBe(StatusCodes.CONFLICT);
    });

    it('should return 400 Bad Request when mandatory "name" is missing', async () => {
      const token = await getDataAdminToken();
      const invalidPayload = { full_name: 'Missing Name' }; // 'name' is required

      const res = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(invalidPayload);

      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('PATCH /datasets/:datasetId', () => {
    it('should update a dataset successfully (200)', async () => {
      const token = await getDataAdminToken();
      const payload = {
        name: 'name',
        author: 'author',
      };

      // add dataset to update
      const postRes = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(payload);

      const updatePayload = { author: 'Updated Author Name' };

      const res = await request(app).patch(`/datasets/${postRes.body.id}`).set('Authorization', `Bearer ${token}`).send(updatePayload);

      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.author).toBe(updatePayload.author);
    });

    it('should fail when attempting to update a readOnly field (e.g. status)', async () => {
      const token = await getDataAdminToken();
      const payload = {
        name: 'name',
        author: 'author',
      };

      // add dataset to update
      const postRes = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(payload);

      const originalId = postRes.body.id;
      const forbiddenPayload = { status: 'new-status-manually-set' }; // 'status' is readOnly

      const res = await request(app).patch(`/datasets/${originalId}`).set('Authorization', `Bearer ${token}`).send(forbiddenPayload);

      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('DELETE /datasets/:datasetId', () => {
    it('should successfully delete an existing dataset (204)', async () => {
      const token = await getDataAdminToken();

      // 1. Create a dataset to delete
      const createPayload = { name: 'Dataset to be Deleted' };
      const postRes = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send(createPayload);

      const id = postRes.body.id;

      // 2. Delete the dataset
      const deleteRes = await request(app).delete(`/datasets/${id}`).set('Authorization', `Bearer ${token}`);

      expect(deleteRes.statusCode).toBe(StatusCodes.NO_CONTENT);

      // 3. Verify it is gone (GET should now return 404)
      const getRes = await request(app).get(`/datasets/${id}`);
      expect(getRes.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('should return 404 even if the dataset does not exist', async () => {
      const token = await getDataAdminToken();

      // Attempting to delete a non-existent slug
      const res = await request(app).delete('/datasets/i-do-not-exist').set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
    it('should successfully delete a dataset using an old slug after name change (204)', async () => {
      const token = await getDataAdminToken();

      const postRes = await request(app).post('/datasets').set('Authorization', `Bearer ${token}`).send({ name: 'Old Name' });
      const oldId = postRes.body.id;

      await request(app).patch(`/datasets/${oldId}`).set('Authorization', `Bearer ${token}`).send({ name: 'New Name' });

      const deleteRes = await request(app).delete(`/datasets/${oldId}`).set('Authorization', `Bearer ${token}`);
      expect(deleteRes.statusCode).toBe(StatusCodes.NO_CONTENT);

      const getRes = await request(app).get(`/datasets/${oldId}`);
      expect(getRes.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /datasets/:datasetId/files', () => {
    it('GET /datasets/:datasetId/files responds with 401 if no token has been provided', async () => {
      const data = await addSyntheticData({ ...syntheticDataOptions });
      const res = await request(app).get(`/datasets/${data.dataset.slug}/files`);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('GET /datasets/:datasetId/files responds with 404 if dataset has not been found', async () => {
      const token = await getDataAdminToken();
      const res = await request(app).get(`/datasets/wrong/files`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('Responds with the list of all available dataset files', async () => {
      const token = await getDataAdminToken();
      const { dataset, file } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
      const res = await request(app).get(`/datasets/${dataset.slug}/files`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(file.slug);
    });

    it('GET /datasets/:datasetId/files responds even when using an old slug', async () => {
      const token = await getDataAdminToken();
      const data = await addSyntheticData({ ...syntheticDataOptions });
      await request(app).patch(`/datasets/${data.dataset.slug}`).set('Authorization', `Bearer ${token}`).send({ name: 'New name' });
      const res = await request(app).get(`/datasets/${data.dataset.slug}/files`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /datasets/:datasetId/mappings', () => {
    it('GET /datasets/:datasetId/mappings responds with 401 if no token has been provided', async () => {
      const data = await addSyntheticData({ ...syntheticDataOptions });
      const res = await request(app).get(`/datasets/${data.dataset.slug}/mappings`);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('GET /datasets/:datasetId/mappings responds with 404 if dataset has not been found', async () => {
      const token = await getDataAdminToken();
      const res = await request(app).get(`/datasets/wrong/mappings`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('Responds with the list of all available dataset mappings', async () => {
      const token = await getDataAdminToken();
      const { dataset, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
      const res = await request(app).get(`/datasets/${dataset.slug}/mappings`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(dataMapping.id);
    });

    it('GET /datasets/:datasetId/mappings responds even when using an old slug', async () => {
      const token = await getDataAdminToken();
      const data = await addSyntheticData({ ...syntheticDataOptions });
      await request(app).patch(`/datasets/${data.dataset.slug}`).set('Authorization', `Bearer ${token}`).send({ name: 'New name' });
      const res = await request(app).get(`/datasets/${data.dataset.slug}/mappings`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /epsg', () => {
    it('GET /epsg responds with a list of supported EPSG codes', async () => {
      const res = await request(app).get('/epsg');
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });
});
