import { describe, expect, it } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../../src/app';
import { getSuperAdminToken, getUserToken } from '../helper';

// Not checked yet (docs/adr/0078), so any bearer stands in for a runner assertion
const ASSERTION = 'Bearer runner-assertion';
const KID = 'a'.repeat(43);
const CLAIM = `/model-runners/crea/claims/${uuidv4()}`;

const MANIFEST = {
  schemaVersion: 1,
  frameworks: [
    {
      id: 'crea',
      analysisType: 'soil_health_index',
      texts: { en: { title: 'CREA soil quality', developedBy: 'CREA' } },
      models: [
        {
          id: 'crea/physical-chemical',
          version: '0.1.0',
          output: 'soil-index',
          texts: { en: { name: 'Physical Chemical parameters' } },
          inputs: [{ name: 'som', sources: [{ property: 'organic-matter', unit: 'g/kg' }] }],
          classification: [{ name: { en: 'Bad' }, min: 100.43, color: '#7a1712' }],
        },
      ],
    },
  ],
};

type Method = 'get' | 'post' | 'put' | 'delete';

describe('Model Runner routes, not implemented yet', () => {
  it.each<[Method, string, object | undefined]>([
    ['post', '/model-runners', { id: 'crea', name: 'CREA', manifest: MANIFEST }],
    ['put', '/model-runners/crea/manifest', MANIFEST],
    ['post', '/model-runners/crea/claims', undefined],
    ['delete', `/model-runners/crea/keys/${KID}`, undefined],
    ['get', `${CLAIM}/units`, undefined],
    ['get', `${CLAIM}/inputs`, undefined],
    ['post', `${CLAIM}/progress`, { percentage: 40 }],
    ['post', `${CLAIM}/complete`, { chunks: 1, provenance: { model_version: '0.1.0' } }],
    ['post', `${CLAIM}/error`, { code: 'insufficient-data', message: 'Not enough data in this area' }],
  ])('answer a runner 501 on %s %s', async (method, path, body) => {
    const res = await request(app)[method](path).set('Authorization', ASSERTION).send(body);

    expect(res.statusCode).toBe(StatusCodes.NOT_IMPLEMENTED);
  });

  it('answer a runner 501 on a score chunk', async () => {
    const line = JSON.stringify({ unit_id: uuidv4(), geometry: { type: 'Point', coordinates: [12.49, 41.89] }, value: 0.42 });

    const res = await request(app)
      .put(`${CLAIM}/scores/1`)
      .set('Authorization', ASSERTION)
      .set('Content-Type', 'application/x-ndjson')
      .send(`${line}\n`);

    expect(res.statusCode).toBe(StatusCodes.NOT_IMPLEMENTED);
  });

  it('refuse a runner call with no token', async () => {
    await request(app).post('/model-runners/crea/claims').expect(StatusCodes.UNAUTHORIZED);
  });

  it('check the body against the spec first', async () => {
    await request(app)
      .put('/model-runners/crea/manifest')
      .set('Authorization', ASSERTION)
      .send({ schemaVersion: 2 })
      .expect(StatusCodes.BAD_REQUEST);
  });

  it('answer 501 on the public list, with no token', async () => {
    await request(app).get('/model-runners').expect(StatusCodes.NOT_IMPLEMENTED);
  });

  it.each<[Method, string, object | undefined]>([
    ['get', '/model-runner-registrations', undefined],
    ['post', '/model-runners/crea/approve', { kid: KID, reads_observations: true }],
    ['post', '/model-runners/crea/disable', undefined],
    ['post', '/model-runners/crea/enable', undefined],
  ])('keep %s %s for super-admins', async (method, path, body) => {
    const user = getUserToken('model-runner-user', 'model-runner-user@example.com');
    await request(app)[method](path).set('Authorization', `Bearer ${user}`).send(body).expect(StatusCodes.FORBIDDEN);

    const admin = await getSuperAdminToken();
    await request(app)[method](path).set('Authorization', `Bearer ${admin}`).send(body).expect(StatusCodes.NOT_IMPLEMENTED);
  });
});
