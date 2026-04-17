import { describe, expect, it, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/app';
import { Token } from '../../src/interfaces/Token';
import { getPgBoss, initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import { JobQueues } from '../../src/types/enums';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getRawTableName, sleep } from '../../src/utils/utils';
import { getDataAdminToken } from '../helper';
import { RequestData } from '../../src/interfaces/RequestData';
import FileService from '../../src/services/FileService';
import * as BulkLoaderModule from '../../src/jobs/bulk-load/BulkLoader';
import * as SoilExportJobModule from '../../src/jobs/soil-export/soilExportJob';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

describe('Testing /jobs routes', () => {
  beforeAll(async () => {
    // Drop pg-boss schema and recreate
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterEach(async () => {
    getPgBoss().clearSpies();
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  it.each([JobQueues.BULK_LOAD, JobQueues.FILE_TO_DB, JobQueues.BULK_DELETE])(
    'POST /jobs without a token trying to create a token protected job fails with HTTP 401',
    async (queue: string) => {
      const bulkRes = await request(app).post('/jobs').send({ type: queue, dataset_id: 'test-dataset' });
      expect(bulkRes.statusCode).toBe(401);
      expect(bulkRes.body.detail).toContain(`Authentication required for ${queue} jobs`);
    },
  );

  it('POST /jobs creates two jobs, GET endpoints return both', async () => {
    const token = await getDataAdminToken();

    jest.spyOn(BulkLoaderModule, 'processBulkLoad').mockResolvedValue(undefined);
    jest.spyOn(SoilExportJobModule, 'processExportJob').mockResolvedValue(undefined);

    // Create bulk load job
    const bulkRes = await request(app)
      .post('/jobs')
      .send({ type: 'bulk-load', dataset_id: 'test-dataset' })
      .set('Authorization', `Bearer ${token}`);
    expect(bulkRes.statusCode).toBe(201);
    expect(bulkRes.body).toHaveProperty('id');

    // Store job ID
    const bulkId = bulkRes.body.id;

    // Create export job (without token)
    const mockId = '960ee487-a6bd-4da8-8ef0-da6ef23d0e80';
    const exportRes = await request(app)
      .post('/jobs')
      .send({ type: 'export', filter_id: mockId, format: 'csv', dataset_ids: ['fake_dataset'] });
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

    // Wait for bulk load job to complete
    const spy = getPgBoss().getSpy(JobQueues.BULK_LOAD);
    await spy.waitForJobWithId(bulkId, 'completed');

    // Check on job status
    const statusRes = await request(app).get(`/jobs/${bulkId}`).set('Authorization', `Bearer ${token}`);
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body.status).toBe('completed');
  });

  it('GET /jobs/:id returns 404 for unknown ID', async () => {
    const token = await getDataAdminToken();
    const res = await request(app).get(`/jobs/not-a-real-id`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);

    const randomUUID = '4d214191-5998-4c42-aace-726dada50ba4';
    const res2 = await request(app).get(`/jobs/${randomUUID}`).set('Authorization', `Bearer ${token}`);
    expect(res2.statusCode).toBe(404);
  });

  it('POST /jobs for file-to-db job', async () => {
    const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
    process.env.LOCAL_STORAGE_ROOT_FOLDER = vectorFilesPassPath;
    const token = await getDataAdminToken();
    const entityManager = await getEntityManager();
    const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };
    const fileService = new FileService();

    const testWorker = async (index: number): Promise<void> => {
      // Create file in DB
      const metadata = {
        driver: 'GeoJSON',
        field_names: ['metadata', 'rawParameters'],
        detected_fields: {
          depth: null,
          horizon: null,
          license: null,
          geometry: null,
          latitude: null,
          longitude: null,
          max_depth: null,
          min_depth: null,
          sampling_date: null,
        },
        geometry_detected: true,
        epsg: 4326,
      };
      const file = {
        name: `sample_point_${index}.geojson`,
        file_path: `sample_point_${index}.geojson`,
        metadata,
      };
      const fileEntity = await fileService.createFile(requestData, file);

      const queue = JobQueues.FILE_TO_DB;
      const jobResponse = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: queue, file_id: fileEntity.slug });
      expect(jobResponse.statusCode).toBe(201);

      // Wait for file to DB job to complete
      const jobId = jobResponse.body.id;
      const spy = getPgBoss().getSpy(queue);
      await spy.waitForJobWithId(jobId, 'completed');

      const statusResponse = await request(app).get(`/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.body.status).toBe('completed');

      // Check that raw table has been created
      const rawTableName = getRawTableName(fileEntity.id);
      const dataSource = await getDataSource();
      const queryRunner = dataSource.createQueryRunner();
      const hasTable = await queryRunner.hasTable(rawTableName);
      expect(hasTable).toBeDefined();
    };

    // Run multiple jobs in parallel to stress test the system
    const promises = [];
    for (let i = 0; i < 1; i++) {
      promises.push(testWorker(i));
    }
    await Promise.all(promises);
  }, 10000);

  it('POST /jobs fails if required fields are missing', async () => {
    const mockId = '960ee487-a6bd-4da8-8ef0-da6ef23d0e80';
    const res = await request(app).post('/jobs').send({ type: 'export', filter_id: mockId, format: 'csv' }); // Missing dataset_ids
    expect(res.statusCode).toBe(400);
  });

  it('POST /jobs extract with "anonymous: true" and no auth token allows get without token', async () => {
    const mockId = '960ee487-a6bd-4da8-8ef0-da6ef23d0e80';

    // 1. Create anonymous job
    const exportRes = await request(app)
      .post('/jobs')
      .send({
        type: 'export',
        filter_id: mockId,
        format: 'csv',
        dataset_ids: ['fake_dataset'],
        anonymous: true,
      });
    expect(exportRes.statusCode).toBe(201);
    expect(exportRes.body.data.created_by).toBeNull(); // Verify the job is indeed anonymous
    const exportId = exportRes.body.id;

    // Verify access without token
    const getRes = await request(app).get(`/jobs/${exportId}`);
    expect(getRes.statusCode).toBe(200);
  });

  it('POST /jobs extract with "anonymous: true" and auth token allows get without token', async () => {
    const mockId = '960ee487-a6bd-4da8-8ef0-da6ef23d0e80';

    // Create anonymous job
    const exportRes = await request(app)
      .post('/jobs')
      .send({
        type: 'export',
        filter_id: mockId,
        format: 'csv',
        dataset_ids: ['fake_dataset'],
        anonymous: true,
      });
    expect(exportRes.statusCode).toBe(201);
    const exportId = exportRes.body.id;

    // Verify access with token
    const token = await getDataAdminToken();

    const getRes = await request(app).get(`/jobs/${exportId}`).set('Authorization', `Bearer ${token}`);

    expect(getRes.statusCode).toBe(200);
  });

  it('POST /jobs with "anonymous: true" on a job other than extract causes bad request', async () => {
    const token = await getDataAdminToken();
    const restrictedRes = await request(app).post('/jobs').set('Authorization', `Bearer ${token}`).send({
      type: JobQueues.BULK_DELETE,
      dataset_id: 'test-dataset',
      anonymous: true,
    });

    expect(restrictedRes.statusCode).toBe(400);
  });
});
