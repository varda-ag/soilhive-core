import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataAdminToken } from '../helper';
import { initPgBoss, PG_BOSS_SCHEMA } from '../../src/services/PgBoss';
import { JobQueues } from '../../src/types/enums';
import { getDataSource } from '../../src/utils/data-source';

describe('Testing /jobs routes', () => {
  beforeAll(async () => {
    // Drop pg-boss schema and recreate
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await new Promise(r => setTimeout(r, 2000)); // Wait for pg-boss table to be ready
  });

  it('POST /jobs without a token trying to create a bulk load job fails with HTTP 401', async () => {
    const bulkRes = await request(app).post(`/jobs`).send({ type: 'bulk-load', dataset_id: 'test-dataset' });
    expect(bulkRes.statusCode).toBe(401);
    expect(bulkRes.body.detail).toContain('Authentication required for bulk load jobs');
  });

  it('POST /jobs creates two jobs, GET endpoints return both', async () => {
    const token = await getDataAdminToken();

    // Create bulk load job
    const bulkRes = await request(app)
      .post(`/jobs`)
      .send({ type: 'bulk-load', dataset_id: 'test-dataset' })
      .set('Authorization', `Bearer ${token}`);
    expect(bulkRes.statusCode).toBe(201);
    expect(bulkRes.body).toHaveProperty('id');

    // Store job ID
    const bulkId = bulkRes.body.id;

    // Create export job (without token)
    const exportRes = await request(app).post(`/jobs`).send({ type: 'export', filter_id: 'mock-filter-id' });
    expect(exportRes.statusCode).toBe(201);
    expect(exportRes.body).toHaveProperty('id');

    // Store job ID
    const exportId = exportRes.body.id;

    // GET all jobs using a token: only bulk load one should be returned
    const listRes = await request(app).get(`/jobs`).set('Authorization', `Bearer ${token}`);
    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    const job = listRes.body[0];
    expect(job.id).toBe(bulkId);
    expect(job.queue).toBe(JobQueues.BULK_LOAD);

    // GET all jobs without a token: this is unauthorized
    const listRes2 = await request(app).get(`/jobs`);
    expect(listRes2.statusCode).toBe(401);

    // GET bulk load job by ID with token should succeed
    const getByIdRes = await request(app).get(`/jobs/${bulkId}`).set('Authorization', `Bearer ${token}`);
    expect(getByIdRes.statusCode).toBe(200);
    expect(getByIdRes.body).toHaveProperty('id', bulkId);

    // GET bulk load job by ID without token should fail
    const getByIdResNoToken = await request(app).get(`/jobs/${bulkId}`);
    expect(getByIdResNoToken.statusCode).toBe(401);

    // GET export job by ID without token should succeed
    const getByIdRes2 = await request(app).get(`/jobs/${exportId}`);
    expect(getByIdRes2.statusCode).toBe(200);
    expect(getByIdRes2.body).toHaveProperty('id', exportId);

    // GET export job by ID with token should succeed
    const getByIdResNoToken2 = await request(app).get(`/jobs/${exportId}`).set('Authorization', `Bearer ${token}`);
    expect(getByIdResNoToken2.statusCode).toBe(200);
    expect(getByIdResNoToken2.body).toHaveProperty('id', exportId);
  });

  it('GET /jobs/:id returns 404 for unknown ID', async () => {
    const token = await getDataAdminToken();
    const res = await request(app).get(`/jobs/not-a-real-id`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);

    const randomUUID = '4d214191-5998-4c42-aace-726dada50ba4';
    const res2 = await request(app).get(`/jobs/${randomUUID}`).set('Authorization', `Bearer ${token}`);
    expect(res2.statusCode).toBe(404);
  });
});
