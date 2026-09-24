import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { app } from '../../../src/app';
import { DataRequestJob } from '../../../src/interfaces/Job';
import { processDataRequest } from '../../../src/jobs/data-requests/DataRequestJob';
import * as PgBossModule from '../../../src/services/PgBoss';
import { getPgBoss, initPgBoss, stopPgBoss } from '../../../src/services/PgBoss';
import { Capability, DataRequestStatus, JobQueues, StatisticsType } from '../../../src/types/enums';
import { insertDataRequest } from '../../../src/data-layer/DataRequests';
import { GISDataType, VocabularyType } from '../../../src/types/data';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { getPolygonFromBbox } from '../../../src/utils/geometry';
import {
  DATASET_BBOX,
  UNIT_A,
  UNIT_B,
  addVectorFileWithGeometries,
  createActiveRunJob,
  createFilter,
  featureCollection,
  readJobData,
  setJobState,
  storageRoot,
} from '../runs/runTestHelpers';
import { sleep } from '../../../src/utils/utils';
import {
  addCategory,
  addDataset,
  addDatasetLayer,
  addFeatures,
  addFile,
  addLayer,
  addObservations,
  addSoilProperty,
  addVocabulary,
} from '../../../src/utils/mock';
import ProcedureEntity from '../../../src/entities/Procedure';
import { getDataAdminToken, getUserToken } from '../../helper';

const createActiveJob = (data: Partial<DataRequestJob>) =>
  createActiveRunJob<DataRequestJob>(JobQueues.DATA_REQUESTS, { statistics_type: StatisticsType.DESCRIPTIVE, ...data });

/**
 * `features` is a global, content-addressed table: no dataset_id, and a UNIQUE geom_hash,
 * so one Feature is shared by every Dataset sampling that exact location. Two datasets
 * seeded at the same coordinates therefore collide on insert. Each call gets its own
 * point, kept well inside UNIT_A so containment assertions still hold.
 */
let featureCounter = 0;
const nextCoordinates = (): [number, number] => {
  const n = featureCounter++;
  return [1 + (n % 10) * 0.03, 1 + Math.floor(n / 10) * 0.03];
};

const seedDataset = async (name: string, values: number[], options: { coordinates?: [number, number]; gisDatatype?: GISDataType } = {}) => {
  const dataset = await addDataset(name, DATASET_BBOX, options.gisDatatype ?? GISDataType.POINT);
  const category = await addCategory(`${name}-cat`);
  const soilProperty = await addSoilProperty(`${name}-prop`, category.id, 'mg/kg');
  const [feature] = await addFeatures(GISDataType.POINT, [options.coordinates ?? nextCoordinates()]);
  // `layers` is likewise global and deduplicated — UNIQUE NULLS NOT DISTINCT over
  // (license, sampling_date, min_depth, max_depth, horizon) — so two datasets cannot each
  // create an identical depth/date slice. The horizon carries the dataset name to keep
  // them distinct; nothing here asserts on horizons.
  const layer = await addLayer(undefined, '2020-06-01', 0, 30, name);
  const method = await addVocabulary(`${name}-method`, VocabularyType.LABORATORY_METHOD);
  const dataSource = await getDataSource();
  const procedureRepo = dataSource.getRepository(ProcedureEntity);
  const procedure = await procedureRepo.save(procedureRepo.create({ laboratory_method_id: method.id }));
  const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
  await addObservations(values, procedure.id, datasetLayer.id);
  return { dataset, soilProperty };
};

describe('processDataRequest', () => {
  beforeAll(async () => {
    await initPgBoss();
    await sleep(2000); // pg-boss tables need a moment to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
    for (const entry of fs.readdirSync(storageRoot)) {
      fs.rmSync(path.join(storageRoot, entry), { recursive: true, force: true });
    }
  });

  describe('aggregation units from a file', () => {
    it('creates one unit per geometry, deduplicating repeats and keeping both record ids', async () => {
      await seedDataset('file-units', [2, 4, 6]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      // Rows 1 and 3 are the same geometry, so they must collapse to one unit.
      const file = await addVectorFileWithGeometries(
        'file-units',
        featureCollection([
          { geometry: UNIT_A, properties: { field_name: 'North' } },
          { geometry: UNIT_B, properties: { field_name: 'South' } },
          { geometry: UNIT_A, properties: { field_name: 'North duplicate' } },
        ]),
        { epsg: 4326 },
      );

      const { jobId, job } = await createActiveJob({ filter_id: filterId, file_id: file.slug, label_field: 'field_name' });
      await processDataRequest(job);
      const result = await readJobData(jobId);

      expect(result.derived_filter_id).not.toBeNull();
      expect(result.unit_count).toBe(2);
      expect(result.units).toHaveLength(2);

      const collapsed = result.units.find(unit => unit.record_ids.length === 2)!;
      expect(collapsed.record_ids).toEqual([1, 3]);
      expect(collapsed.label).toBe('North; North duplicate');
      expect(collapsed.area_m2).toBeGreaterThan(0);
      expect(collapsed.raster_filtered).toBe(false);
    });

    it('reuses the same derived filter when re-run on the same file and criteria', async () => {
      await seedDataset('idempotent', [1, 2]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries('idempotent', featureCollection([{ geometry: UNIT_A }]), { epsg: 4326 });

      const first = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processDataRequest(first.job);
      const second = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processDataRequest(second.job);

      const firstData = await readJobData(first.jobId);
      const secondData = await readJobData(second.jobId);
      expect(firstData.derived_filter_id).toBe(secondData.derived_filter_id);
    });

    it('never hands its derived filter back to a client submitting the same geometries', async () => {
      // Regression guard for docs/adr/0020. Without the namespaced hash the POST below
      // would conflict onto the derived filter, whose stored geometries are empty — the
      // AOI would then vanish from the UI, which reads filter.geometries.
      await seedDataset('no-collision', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries('no-collision', featureCollection([{ geometry: UNIT_A }]), { epsg: 4326 });

      const { jobId, job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processDataRequest(job);
      const derivedFilterId = (await readJobData(jobId)).derived_filter_id;

      const clientFilterId = await createFilter([UNIT_A]);
      expect(clientFilterId).not.toBe(derivedFilterId);

      const clientFilter = await request(app).get(`/data-filters/${clientFilterId}`).expect(200);
      expect(clientFilter.body.filter.geometries).toHaveLength(1);

      // The derived filter keeps no geometries of its own; they are only reachable via
      // the geometries endpoint.
      const derivedFilter = await request(app).get(`/data-filters/${derivedFilterId}`).expect(200);
      expect(derivedFilter.body.filter.geometries).toEqual([]);
      expect(derivedFilter.body.filter.source_file_id).toBeDefined();

      const geometries = await request(app).get(`/data-filters/${derivedFilterId}/geometries`).expect(200);
      expect(geometries.body.type).toBe('FeatureCollection');
      expect(geometries.body.total).toBe(1);
      expect(geometries.body.next_cursor).toBeNull();
      expect(geometries.body.features[0].geometry.type).toBe('Polygon');
    });

    it('rejects a file whose geometries are not all polygons', async () => {
      await seedDataset('non-polygon', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries(
        'non-polygon',
        featureCollection([{ geometry: UNIT_A }, { geometry: { type: 'Point', coordinates: [1, 1] } }]),
        { epsg: 4326 },
      );

      const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'RUN_NON_POLYGON_GEOMETRY' });
    });

    it('rejects a file with more geometries than the unit cap', async () => {
      await seedDataset('too-many', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const previous = process.env['DATA_REQUESTS_MAX_UNITS'];
      process.env['DATA_REQUESTS_MAX_UNITS'] = '1';
      try {
        const file = await addVectorFileWithGeometries('too-many', featureCollection([{ geometry: UNIT_A }, { geometry: UNIT_B }]), {
          epsg: 4326,
        });
        const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
        await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'RUN_TOO_MANY_UNITS' });

        // Nothing was written before the cap was checked.
        const entityManager = await getEntityManager();
        const [{ count }] = await entityManager.query('SELECT COUNT(*)::int AS count FROM user_geometries');
        expect(count).toBe(1); // only the filter's own AOI geometry
      } finally {
        if (previous === undefined) delete process.env['DATA_REQUESTS_MAX_UNITS'];
        else process.env['DATA_REQUESTS_MAX_UNITS'] = previous;
      }
    });

    it('rejects a file with no coordinate reference system', async () => {
      await seedDataset('no-epsg', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries('no-epsg', featureCollection([{ geometry: UNIT_A }]), { epsg: undefined });

      const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'RUN_MISSING_EPSG' });
    });

    it('rejects a non-spatial file, which has no metadata to read geometry from', async () => {
      await seedDataset('non-spatial', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      fs.writeFileSync(path.join(storageRoot, 'notes.txt'), 'not soil data');
      const file = await addFile('notes.txt');

      const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'RUN_FILE_NOT_SPATIAL' });
    });

    it('keeps a MultiPolygon as a single unit', async () => {
      await seedDataset('multipolygon', [1, 2]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const multi = { type: 'MultiPolygon', coordinates: [UNIT_A.coordinates, UNIT_B.coordinates] };
      const file = await addVectorFileWithGeometries('multipolygon', featureCollection([{ geometry: multi }]), { epsg: 4326 });

      const { jobId, job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processDataRequest(job);

      // Exploding collections would have produced two units here.
      expect((await readJobData(jobId)).unit_count).toBe(1);
    });
  });

  describe('aggregation units from the filter', () => {
    it('uses the filter geometries and creates no derived filter', async () => {
      await seedDataset('filter-units', [10, 20]);
      const filterId = await createFilter([UNIT_A, UNIT_B]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processDataRequest(job);
      const result = await readJobData(jobId);

      expect(result.derived_filter_id).toBeNull();
      expect(result.unit_count).toBe(2);
      expect(result.progress_percentage).toBe(100);
    });
  });

  describe('dataset selection', () => {
    it('completes rather than failing when a matched dataset has no preview entitlement', async () => {
      await seedDataset('visible-ds', [1, 2]);
      const { dataset: privateDataset } = await seedDataset('hidden-ds', [5, 6]);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [privateDataset.id]);

      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processDataRequest(job);
      const result = await readJobData(jobId);

      // An unentitled dataset must be skipped, not fatal — that much still shows.
      expect(result.progress_percentage).toBe(100);
    });

    it('fails when an explicitly named dataset has no preview entitlement', async () => {
      const { dataset } = await seedDataset('named-hidden-ds', [1]);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [dataset.id]);

      const filterId = await createFilter([UNIT_A]);
      const { job } = await createActiveJob({ filter_id: filterId, dataset_ids: [dataset.slug] });
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'DR_DATASET_NOT_ENTITLED' });
    });

    it('completes over a filter that also matches a raster dataset', async () => {
      await seedDataset('vector-ds', [1, 2]);
      await addDataset('raster-ds', DATASET_BBOX, GISDataType.RASTER);

      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processDataRequest(job);
      const result = await readJobData(jobId);

      expect(result.progress_percentage).toBe(100);
    });
  });

  /**
   * The Data Request record (docs/adr/0037).
   *
   * processDataRequest is the single write site for `data_requests`, and the three outcomes it
   * distinguishes are what these cover: a payload, a throw, and — the one that is easy to get
   * wrong — a cancellation, which returns normally with nothing and must write no row at all.
   */
  describe('the record it writes', () => {
    const readRecord = async (id: string) => {
      const entityManager = await getEntityManager();
      const [row] = await entityManager.query(`SELECT * FROM data_requests WHERE id = $1`, [id]);
      return row;
    };

    it('records a completed run under the job id, with the resolved units', async () => {
      await seedDataset('record-completed-ds', [10, 20]);
      const filterId = await createFilter([UNIT_A, UNIT_B]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId, histogram_bins: 20 });
      await processDataRequest(job);

      const record = await readRecord(jobId);
      // The id is the job's, not one the table generated: that is what lets a single id address
      // the request while the job lives and the record afterwards.
      expect(record.id).toBe(jobId);
      expect(record.status).toBe('completed');
      expect(record.message).toBeNull();
      expect(record.data).toMatchObject({ truncated: expect.any(Boolean), results: expect.any(Array) });
      expect(record.created_at).toBeInstanceOf(Date);
      expect(record.completed_at).toBeInstanceOf(Date);

      // What was asked, plus what resolving it produced — without which unit_id in the payload
      // is an identifier with nothing to match it against once the job is gone.
      expect(record.request).toMatchObject({
        statistics_type: StatisticsType.DESCRIPTIVE,
        filter_id: filterId,
        histogram_bins: 20,
        unit_count: 2,
      });
      expect(record.request.units).toHaveLength(2);
      expect(record.request.units[0]).toMatchObject({ unit_id: expect.any(String) });
    });

    // The record has no owner, and is returned verbatim. A leak here is permanent and readable
    // by anyone holding the id.
    it('never writes the submitter or their privilege into the request', async () => {
      await seedDataset('record-no-auth-ds', [1, 2]);
      const filterId = await createFilter([UNIT_A]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId, created_by: 'someone@example.com', isDataAdmin: true });
      await processDataRequest(job);

      const { request: recorded } = await readRecord(jobId);
      expect(Object.keys(recorded)).not.toContain('created_by');
      expect(Object.keys(recorded)).not.toContain('isDataAdmin');
      expect(Object.keys(recorded)).not.toContain('isSuperAdmin');
      expect(JSON.stringify(recorded)).not.toContain('someone@example.com');
    });

    it('records a failed run with a translated message and no data', async () => {
      const { dataset } = await seedDataset('record-failed-ds', [1]);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [dataset.id]);

      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, dataset_ids: [dataset.slug] });
      // Still throws: pg-boss must fail the job, and the existing error surfacing is untouched.
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'DR_DATASET_NOT_ENTITLED' });

      const record = await readRecord(jobId);
      expect(record.status).toBe('failed');
      expect(record.data).toBeNull();
      // Display-ready copy, not the raw "JobError: DR_DATASET_NOT_ENTITLED".
      expect(record.message).toEqual(expect.any(String));
      expect(record.message).not.toContain('DR_DATASET_NOT_ENTITLED');
    });

    it('records a failure that happened before any unit was resolved', async () => {
      const filterId = await createFilter([UNIT_A]);
      const file = await addVectorFileWithGeometries('record-failure-before-units', featureCollection([{ geometry: UNIT_A }]), {
        epsg: undefined,
      });

      const { jobId, job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'RUN_MISSING_EPSG' });

      const record = await readRecord(jobId);
      expect(record.status).toBe('failed');
      // The request is still recorded, with the resolved half empty rather than absent.
      expect(record.request).toMatchObject({ filter_id: filterId, unit_count: 0, units: [], derived_filter_id: null });
    });

    it('writes nothing for a cancelled run', async () => {
      await seedDataset('record-cancelled-ds', [10, 20]);
      const filterId = await createFilter([UNIT_A]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      // Cancelled before the first checkpoint, exactly as DELETE /data-requests/{id} does it.
      await setJobState(jobId, 'cancelled');
      await processDataRequest(job);

      // No row: cancelling is how a Data Request is destroyed, so writing one here would
      // resurrect what the caller deleted.
      expect(await readRecord(jobId)).toBeUndefined();
    });

    /**
     * The cancellation checkpoints are not the last thing a Run does, so a DELETE landing after
     * the final one leaves the processor about to write a row for a request that no longer
     * exists - and that row would be permanent, because the job is `cancelled` and reads
     * therefore fall through to the record with nothing left to sweep it. The write itself
     * carries the check, so the two cases below are the write refusing rather than the Run
     * noticing.
     */
    it('refuses to write a record once the job has been cancelled', async () => {
      const { jobId } = await createActiveJob({ filter_id: await createFilter([UNIT_A]) });
      const entityManager = await getEntityManager();
      await setJobState(jobId, 'cancelled');

      await insertDataRequest(entityManager, {
        id: jobId,
        status: DataRequestStatus.COMPLETED,
        request: { statistics_type: StatisticsType.DESCRIPTIVE, filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] },
        data: { results: [], truncated: false },
        message: null,
        created_at: new Date(),
        completed_at: new Date(),
      });

      expect(await readRecord(jobId)).toBeUndefined();
    });

    it('refuses to write a record once the job row is gone', async () => {
      const { jobId } = await createActiveJob({ filter_id: await createFilter([UNIT_A]) });
      const entityManager = await getEntityManager();
      // How DELETE disposes of a Run that had already terminated: cancel cannot touch it, so the
      // job row is removed outright.
      await getPgBoss().deleteJob(JobQueues.DATA_REQUESTS, jobId);

      await insertDataRequest(entityManager, {
        id: jobId,
        status: DataRequestStatus.COMPLETED,
        request: { statistics_type: StatisticsType.DESCRIPTIVE, filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] },
        data: { results: [], truncated: false },
        message: null,
        created_at: new Date(),
        completed_at: new Date(),
      });

      expect(await readRecord(jobId)).toBeUndefined();
    });

    /**
     * A failure that is not a JobError carries internal text - a statement timeout's own words, a
     * constraint violation naming a column. `runJob` records those as `UNEXPECTED_ERROR` with the
     * raw text as `detail`, so the job reports generic copy; this column has to say the same
     * thing, and for a stronger reason: it is read by any bearer of the id and, unlike a job row,
     * it is never reaped.
     */
    it('records a non-JobError failure as generic copy, never its own message', async () => {
      const unknownFilter = '960ee487-a6bd-4da8-8ef0-da6ef23d0e80';
      const { jobId, job } = await createActiveJob({ filter_id: unknownFilter });

      // FilterService throws an ErrorResponse, not a JobError - the message names the filter.
      await expect(processDataRequest(job)).rejects.toThrow(unknownFilter);

      const record = await readRecord(jobId);
      expect(record.status).toBe('failed');
      expect(record.message).toBe('An unexpected error occurred during processing. Try again. If the problem persists, contact support.');
      expect(record.message).not.toContain(unknownFilter);
    });
  });

  /**
   * The only tests in this file that let a real worker run the job.
   *
   * Everything else hand-builds a payload and calls processDataRequest directly, which
   * cannot cover this: the identity a job runs under is decided by JobService.createJob,
   * and createActiveJob writes created_by itself. The bug this guards against lived
   * precisely in that gap — the API authorised the caller by their Subject (the email
   * claim) while the processor re-derived entitlements from the raw sub, matched no rows,
   * and fell back to `everyone`'s. So the chain has to start at a real token and a real
   * POST /data-requests, and the worker has to be the thing that picks the job up.
   *
   * The token is optional on that route and is honoured when sent (docs/adr/0037) — which is
   * exactly what is under test here: what a token changes is which datasets the run may read,
   * and nothing else.
   */
  describe('caller entitlements', () => {
    // Deliberately different strings: were created_by to regress to the sub, every
    // assertion below would fail rather than quietly still pass.
    const CALLER_SUB = 'stats-caller-sub';
    const CALLER_EMAIL = 'stats-caller@localhost';

    /** Seeds a private dataset and, when granted, gives the caller PREVIEW over it. */
    const seedPrivateDataset = async (name: string, values: number[], granted: boolean) => {
      const { dataset } = await seedDataset(name, values);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [dataset.id]);
      if (granted) {
        // Granted through the real admin route, so the key the grant is stored under is
        // the product's, not one this test invented.
        const adminToken = await getDataAdminToken();
        await request(app)
          .put(`/datasets/${dataset.slug}/entitlements`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ [CALLER_EMAIL]: [Capability.PREVIEW] })
          .expect(200);
      }
      return dataset;
    };

    /** Submits the data request as the caller and waits for the worker to finish it. */
    const runAsCaller = async (token: string, body: object): Promise<{ jobId: string; data: DataRequestJob }> => {
      const res = await request(app).post('/data-requests').set('Authorization', `Bearer ${token}`).send(body).expect(201);
      const jobId = res.body.id;
      const spy = getPgBoss().getSpy<DataRequestJob>(JobQueues.DATA_REQUESTS);
      await spy.waitForJobWithId(jobId, 'completed');
      return { jobId, data: await readJobData(jobId) };
    };

    it('runs under the Subject over a mix of entitled and unentitled private datasets', async () => {
      // Still seeded, because the run has to have the same mix of entitled and unentitled
      // data in front of it — only the assertions about which ones it read are gone.
      await seedPrivateDataset('entitled-a', [10, 20], true);
      await seedPrivateDataset('entitled-b', [30, 40], true);
      await seedPrivateDataset('unentitled-c', [50, 60], false);

      const token = getUserToken(CALLER_SUB, CALLER_EMAIL);
      const filterResponse = await request(app)
        .post('/data-filters')
        .set('Authorization', `Bearer ${token}`)
        .send({
          geometries: [UNIT_A],
          parameters: {},
        });
      expect(filterResponse.statusCode).toBe(201);

      const { jobId, data } = await runAsCaller(token, {
        statistics_type: StatisticsType.DESCRIPTIVE,
        filter_id: filterResponse.body.id,
      });

      // The Subject, not the sub: this is the value the processor looks entitlements up by.
      expect(data.created_by).toBe(CALLER_EMAIL);
      expect(data.progress_percentage).toBe(100);

      // Neither /jobs nor /jobs/{jobId} serves this queue (docs/adr/0037), so the Subject has no
      // ownership left to observe through the API; that exclusion is asserted in
      // routes/data-requests.test.ts. The Data Request itself is readable with no token at all:
      // the id is the permission, and the Subject decides nothing here.
      const anonymous = await request(app).get(`/data-requests/${jobId}`);
      expect(anonymous.statusCode).toBe(200);
    });

    it('completes a run naming those datasets explicitly, rather than refusing what enqueue allowed', async () => {
      // Named datasets are gated twice — enforceEntitlements at enqueue time, then again
      // in the processor. If the two gates resolve identity differently the API returns
      // 201 and the job then dies with DR_DATASET_NOT_ENTITLED, which is exactly what a
      // sub-keyed processor did.
      const datasetA = await seedPrivateDataset('named-a', [1, 2], true);
      const datasetB = await seedPrivateDataset('named-b', [3, 4], true);

      const token = getUserToken(CALLER_SUB, CALLER_EMAIL);
      const filterResponse = await request(app)
        .post('/data-filters')
        .set('Authorization', `Bearer ${token}`)
        .send({
          geometries: [UNIT_A],
          parameters: {},
        });
      expect(filterResponse.statusCode).toBe(201);

      const { data } = await runAsCaller(token, {
        statistics_type: StatisticsType.DESCRIPTIVE,
        filter_id: filterResponse.body.id,
        dataset_ids: [datasetA.slug, datasetB.slug],
      });

      // Completion is the assertion: a processor resolving identity differently from the
      // enqueue gate would have died with DR_DATASET_NOT_ENTITLED before reaching 100.
      expect(data.progress_percentage).toBe(100);
    });

    it('refuses at enqueue time when the caller holds no entitlement for a named dataset', async () => {
      // The mirror image, proving the grant is what the chain turns on rather than the
      // dataset merely existing: same caller, same route, no grant.
      const dataset = await seedPrivateDataset('ungranted', [1, 2], false);

      const token = getUserToken(CALLER_SUB, CALLER_EMAIL);
      const filterResponse = await request(app)
        .post('/data-filters')
        .set('Authorization', `Bearer ${token}`)
        .send({
          geometries: [UNIT_A],
          parameters: {},
        });
      expect(filterResponse.statusCode).toBe(201);

      const res = await request(app)
        .post('/data-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          statistics_type: StatisticsType.DESCRIPTIVE,
          filter_id: filterResponse.body.id,
          dataset_ids: [dataset.slug],
        });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('progress and cancellation', () => {
    it('reports increasing progress and finishes at 100', async () => {
      await seedDataset('progress-ds', [1, 2, 3]);
      const filterId = await createFilter([UNIT_A]);
      const updateSpy = jest.spyOn(PgBossModule, 'updateJobState');

      try {
        const { jobId, job } = await createActiveJob({ filter_id: filterId });
        await processDataRequest(job);

        const percentages = updateSpy.mock.calls
          .map(call => (call[1] as Partial<DataRequestJob>).progress_percentage)
          .filter((value): value is number => typeof value === 'number');

        expect(percentages.length).toBeGreaterThan(3);
        expect(percentages[0]).toBeLessThan(100);
        expect(percentages[percentages.length - 1]).toBe(100);
        for (let i = 1; i < percentages.length; i++) {
          expect(percentages[i]!).toBeGreaterThanOrEqual(percentages[i - 1]!);
        }

        const stored = await readJobData(jobId);
        expect(stored.progress_percentage).toBe(100);
        expect(stored.progress_description).toContain('Completed');
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('stops without writing results when the job is cancelled', async () => {
      await seedDataset('cancelled-ds', [1, 2, 3]);
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await setJobState(jobId, 'cancelled');

      await expect(processDataRequest(job)).resolves.toBeUndefined();

      // Nothing is written on cancellation. Job data is the half asserted here — that the run
      // never reached completion; that no Data Request row is written either is asserted in
      // 'the record it writes'.
      const stored = await readJobData(jobId);
      expect(stored.progress_percentage).not.toBe(100);
    });
  });

  describe('statistics_type', () => {
    it('computes descriptive statistics when that is the named type', async () => {
      await seedDataset('type-descriptive', [1, 2, 3]);
      const filterId = await createFilter([UNIT_A]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.DESCRIPTIVE });
      await processDataRequest(job);
      const stored = await readJobData(jobId);

      // The payload goes to the `data_requests` row, not into job data, so the completion line
      // is what says the descriptive producer ran here: it counts dataset/property groups.
      expect(stored.progress_description).toContain('dataset/property group(s)');
    });

    it('fails rather than assuming descriptive when the type is absent', async () => {
      await seedDataset('type-absent', [1]);
      const filterId = await createFilter([UNIT_A]);
      // Built without the wrapper, which names the type: this job's data genuinely lacks it,
      // as a job enqueued before the field became required would.
      const { jobId, job } = await createActiveRunJob<DataRequestJob>(JobQueues.DATA_REQUESTS, { filter_id: filterId });

      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'DR_UNKNOWN_STATISTICS_TYPE' });

      const stored = await readJobData(jobId);
      expect(stored.progress_percentage).not.toBe(100);
    });

    it('fails rather than falling back to descriptive on an unrecognised type', async () => {
      await seedDataset('type-unknown', [1]);
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({
        filter_id: filterId,
        statistics_type: 'not-a-type' as StatisticsType,
      });

      await expect(processDataRequest(job)).rejects.toMatchObject({ code: 'DR_UNKNOWN_STATISTICS_TYPE' });

      // A wrong name must not silently yield the default product.
      const stored = await readJobData(jobId);
      expect(stored.progress_percentage).not.toBe(100);
    });
  });
});
