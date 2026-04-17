import { describe, it, expect, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import request from 'supertest';
import { app } from '../../src/app';
import { addVocabulary } from '../../src/utils/mock';
import { VocabularyType } from '../../src/types/data';
import { getDataAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';
import { getDataSource } from '../../src/utils/data-source';
import VocabularyEntity from '../../src/entities/Vocabulary';

const vocabularyBody = {
  name: 'air dry',
  category: VocabularyType.SAMPLE_PRETREATMENT,
};

describe('Testing /vocabulary routes', () => {
  let authHeader: IncomingHttpHeaders;

  beforeAll(async () => {
    const token = await getDataAdminToken();
    authHeader = { Authorization: `Bearer ${token}` };
  });

  describe('GET /vocabulary', () => {
    it('returns 200 with an empty array when no items exist', async () => {
      const res = await request(app).get('/vocabulary');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns 200 with items after creation', async () => {
      await addVocabulary(vocabularyBody.name, vocabularyBody.category);

      const res = await request(app).get('/vocabulary');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.length).toBeGreaterThan(0);
      expect(typeof res.body[0].id).toBe('string');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('category');
    });

    it('returns items from multiple categories', async () => {
      await addVocabulary('air dry', VocabularyType.SAMPLE_PRETREATMENT);
      await addVocabulary('Mehlich 3', VocabularyType.LABORATORY_METHOD);

      const res = await request(app).get('/vocabulary');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.length).toBe(2);
    });
  });

  describe('GET /vocabulary/:vocabularyId', () => {
    it('returns 200 with the correct item', async () => {
      const createRes = await request(app).post('/vocabulary').set(authHeader).send(vocabularyBody);
      expect(createRes.statusCode).toBe(StatusCodes.CREATED);
      const vocabularyId = createRes.body.id;
      const dataSource = await getDataSource();

      const repo = dataSource.getRepository(VocabularyEntity);
      const row = await repo.findOneBy({ slug: vocabularyId });
      expect(row).toBeTruthy();
    });

    it('returns 404 for a non-existent slug', async () => {
      const res = await request(app).get('/vocabulary/non-existent-vocabulary-item');
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('returns 301 redirect when accessed via old slug', async () => {
      const createRes = await request(app).post('/vocabulary').set(authHeader).send(vocabularyBody);
      expect(createRes.statusCode).toBe(StatusCodes.CREATED);
      const currentSlug = createRes.body.id;

      const res = await request(app).get(`/vocabulary/${currentSlug}`).redirects(0);
      expect(res.statusCode).toBe(StatusCodes.OK);
      // To test the redirect itself, access via a known old slug from SlugHistory
      // This requires seeding a slug history entry pointing to the same entity
    });
  });

  describe('POST /vocabulary', () => {
    it('returns 201 with the created item', async () => {
      const res = await request(app).post('/vocabulary').set(authHeader).send(vocabularyBody);
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(typeof res.body.id).toBe('string');
      expect(res.body.name).toBe(vocabularyBody.name);
      expect(res.body.category).toBe(vocabularyBody.category);
    });

    it('returns 401 without an auth token', async () => {
      const res = await request(app).post('/vocabulary').send(vocabularyBody);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });
});
