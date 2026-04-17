import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { IncomingHttpHeaders } from 'http';
import request from 'supertest';
import { app } from '../../src/app';
import { addVocabulary } from '../../src/utils/mock';
import { VocabularyType, ProcedureTechnique } from '../../src/types/data';
import { getDataAdminToken } from '../helper';
import { StatusCodes } from 'http-status-codes';

const SAMPLE_PRETREATMENT = 'air dry';
const LABORATORY_METHOD = 'Mehlich 3';

const procedureBody = {
  sample_pretreatment: SAMPLE_PRETREATMENT,
  technique: ProcedureTechnique.LAB_PROCEDURE,
  laboratory_method: LABORATORY_METHOD,
};

describe('Testing /procedures routes', () => {
  let authHeader: IncomingHttpHeaders;

  beforeAll(async () => {
    const token = await getDataAdminToken();
    authHeader = { Authorization: `Bearer ${token}` };
  });

  beforeEach(async () => {
    await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
    await addVocabulary(LABORATORY_METHOD, VocabularyType.LABORATORY_METHOD);
  });

  describe('GET /procedures', () => {
    it('returns 200 with an empty array when no procedures exist', async () => {
      const res = await request(app).get('/procedures');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns 200 with procedures after one is created', async () => {
      await request(app).post('/procedures').set(authHeader).send(procedureBody);

      const res = await request(app).get('/procedures');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.length).toBeGreaterThan(0);
      expect(typeof res.body[0].id).toBe('string');
      expect(res.body[0].id.length).toBeGreaterThan(0);
    });
  });

  describe('GET /procedures/:procedureId', () => {
    it('returns 200 with the correct procedure', async () => {
      const createRes = await request(app).post('/procedures').set(authHeader).send(procedureBody);
      expect(createRes.statusCode).toBe(StatusCodes.CREATED);
      const procedureId = createRes.body.id;

      const res = await request(app).get(`/procedures/${procedureId}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.id).toBe(procedureId);
    });

    it('returns 404 for a non-existent slug', async () => {
      const res = await request(app).get('/procedures/non-existent-procedure');
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /procedures/techniques', () => {
    it('returns 200 with all technique values', async () => {
      const res = await request(app).get('/procedures/techniques');
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual(Object.values(ProcedureTechnique));
    });
  });

  describe('POST /procedures', () => {
    it('returns 201 with the created procedure', async () => {
      const res = await request(app).post('/procedures').set(authHeader).send(procedureBody);
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      console.log(res.body);
      expect(res.body.sample_pretreatment).toBe(SAMPLE_PRETREATMENT);
      expect(res.body.technique).toBe(ProcedureTechnique.LAB_PROCEDURE);
      expect(res.body.laboratory_method).toBe(LABORATORY_METHOD);
    });

    it('returns 400 when a vocabulary name does not exist', async () => {
      const res = await request(app)
        .post('/procedures')
        .set(authHeader)
        .send({ ...procedureBody, sample_pretreatment: 'non-existent-vocab' });
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('returns 401 without an auth token', async () => {
      const res = await request(app).post('/procedures').send(procedureBody);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
  });
});
