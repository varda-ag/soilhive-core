import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { Job } from 'pg-boss';
import request from 'supertest';
import { Polygon } from 'geojson';
import { app } from '../../../src/app';
import { SoilStatisticsJob } from '../../../src/interfaces/Job';
import { processSoilStatistics } from '../../../src/jobs/soil-statistics/SoilStatisticsJob';
import * as PgBossModule from '../../../src/services/PgBoss';
import { getPgBoss, initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../../src/services/PgBoss';
import { Capability, JobQueues, StatisticsType } from '../../../src/types/enums';
import { GISDataType, VocabularyType } from '../../../src/types/data';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { getPolygonFromBbox } from '../../../src/utils/geometry';
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
import FileEntity from '../../../src/entities/File';
import ProcedureEntity from '../../../src/entities/Procedure';
import { getDataAdminToken, getUserToken } from '../../helper';

const storageRoot = process.env.LOCAL_STORAGE_ROOT_FOLDER!;
const DATASET_BBOX = [-1, -1, 5, 5];
const UNIT_A = getPolygonFromBbox([0, 0, 2, 2]);
const UNIT_B = getPolygonFromBbox([2.5, 2.5, 4, 4]);

const featureCollection = (features: { geometry: unknown; properties?: Record<string, unknown> }[]) => ({
  type: 'FeatureCollection',
  features: features.map(feature => ({ type: 'Feature', geometry: feature.geometry, properties: feature.properties ?? {} })),
});

/** Writes a vector file into local storage and registers it with vector metadata. */
const addVectorFileWithGeometries = async (
  name: string,
  collection: object,
  options: { epsg?: number | undefined; fieldNames?: string[] } = {},
): Promise<FileEntity> => {
  const fileName = `${name}.geojson`;
  fs.writeFileSync(path.join(storageRoot, fileName), JSON.stringify(collection));

  const file = await addFile(fileName);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(FileEntity);
  await repo.update(file.id, {
    metadata: {
      is_raster: false,
      field_names: options.fieldNames ?? ['field_name'],
      detected_fields: {} as any,
      detected_mapping: {} as any,
      geometry_detected: true,
      driver: 'GeoJSON',
      ...(options.epsg === undefined ? {} : { epsg: options.epsg }),
    },
  });
  return await repo.findOneByOrFail({ id: file.id });
};

/**
 * pg-boss only accepts progress writes while a job is `active`, so the row is flipped
 * explicitly rather than racing a real worker — the progress assertions then become
 * deterministic.
 */
const createActiveJob = async (data: Partial<SoilStatisticsJob>): Promise<{ jobId: string; job: Job<SoilStatisticsJob> }> => {
  const payload = {
    type: JobQueues.SOIL_STATISTICS,
    created_by: 'test-user',
    progress_percentage: 0,
    isDataAdmin: false,
    isSuperAdmin: false,
    ...data,
  } as SoilStatisticsJob;

  const boss = getPgBoss();
  const jobId = (await boss.send(JobQueues.SOIL_STATISTICS, payload))!;
  const entityManager = await getEntityManager();
  await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = 'active' WHERE id = $1`, [jobId]);

  return {
    jobId,
    job: {
      id: jobId,
      name: JobQueues.SOIL_STATISTICS,
      data: payload,
      expireInSeconds: 3600,
      signal: AbortSignal.timeout(120000),
      heartbeatSeconds: 30,
    } as Job<SoilStatisticsJob>,
  };
};

const readJobData = async (jobId: string): Promise<SoilStatisticsJob> => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(`SELECT data FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return row.data;
};

const setJobState = async (jobId: string, state: string): Promise<void> => {
  const entityManager = await getEntityManager();
  await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = $2 WHERE id = $1`, [jobId, state]);
};

/** Creates a filter through the API so it is stored exactly as a client's would be. */
const createFilter = async (geometries: Polygon[], parameters: object = {}): Promise<string> => {
  const response = await request(app).post('/data-filters').send({ geometries, parameters }).expect(201);
  return response.body.id;
};

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

describe('processSoilStatistics', () => {
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
      const { dataset } = await seedDataset('file-units', [2, 4, 6]);
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
      await processSoilStatistics(job);
      const result = await readJobData(jobId);

      expect(result.derived_filter_id).not.toBeNull();
      expect(result.unit_count).toBe(2);
      expect(result.units).toHaveLength(2);

      const collapsed = result.units.find(unit => unit.record_ids.length === 2)!;
      expect(collapsed.record_ids).toEqual([1, 3]);
      expect(collapsed.label).toBe('North; North duplicate');
      expect(collapsed.area_m2).toBeGreaterThan(0);
      expect(collapsed.raster_filtered).toBe(false);

      // The single Feature at (1, 1) sits in the collapsed unit only.
      const group = result.results.find(entry => entry.dataset_id === dataset.slug)!;
      expect(group.overall.count).toBe(3);
      expect(group.overall.mean).toBe(4);
      const unitStats = group.units.find(unit => unit.unit_id === collapsed.unit_id)!;
      expect(unitStats.count).toBe(3);
    });

    it('reuses the same derived filter when re-run on the same file and criteria', async () => {
      await seedDataset('idempotent', [1, 2]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries('idempotent', featureCollection([{ geometry: UNIT_A }]), { epsg: 4326 });

      const first = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processSoilStatistics(first.job);
      const second = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processSoilStatistics(second.job);

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
      await processSoilStatistics(job);
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
      await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_NON_POLYGON_GEOMETRY' });
    });

    it('rejects a file with more geometries than the unit cap', async () => {
      await seedDataset('too-many', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const previous = process.env['SOIL_STATISTICS_MAX_UNITS'];
      process.env['SOIL_STATISTICS_MAX_UNITS'] = '1';
      try {
        const file = await addVectorFileWithGeometries('too-many', featureCollection([{ geometry: UNIT_A }, { geometry: UNIT_B }]), {
          epsg: 4326,
        });
        const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
        await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_TOO_MANY_UNITS' });

        // Nothing was written before the cap was checked.
        const entityManager = await getEntityManager();
        const [{ count }] = await entityManager.query('SELECT COUNT(*)::int AS count FROM user_geometries');
        expect(count).toBe(1); // only the filter's own AOI geometry
      } finally {
        if (previous === undefined) delete process.env['SOIL_STATISTICS_MAX_UNITS'];
        else process.env['SOIL_STATISTICS_MAX_UNITS'] = previous;
      }
    });

    it('rejects a file with no coordinate reference system', async () => {
      await seedDataset('no-epsg', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries('no-epsg', featureCollection([{ geometry: UNIT_A }]), { epsg: undefined });

      const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_MISSING_EPSG' });
    });

    it('rejects a non-spatial file, which has no metadata to read geometry from', async () => {
      await seedDataset('non-spatial', [1]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      fs.writeFileSync(path.join(storageRoot, 'notes.txt'), 'not soil data');
      const file = await addFile('notes.txt');

      const { job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_FILE_NOT_SPATIAL' });
    });

    it('keeps a MultiPolygon as a single unit', async () => {
      await seedDataset('multipolygon', [1, 2]);
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const multi = { type: 'MultiPolygon', coordinates: [UNIT_A.coordinates, UNIT_B.coordinates] };
      const file = await addVectorFileWithGeometries('multipolygon', featureCollection([{ geometry: multi }]), { epsg: 4326 });

      const { jobId, job } = await createActiveJob({ filter_id: filterId, file_id: file.slug });
      await processSoilStatistics(job);

      // Exploding collections would have produced two units here.
      expect((await readJobData(jobId)).unit_count).toBe(1);
    });
  });

  describe('aggregation units from the filter', () => {
    it('uses the filter geometries and creates no derived filter', async () => {
      const { dataset } = await seedDataset('filter-units', [10, 20]);
      const filterId = await createFilter([UNIT_A, UNIT_B]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processSoilStatistics(job);
      const result = await readJobData(jobId);

      expect(result.derived_filter_id).toBeNull();
      expect(result.unit_count).toBe(2);
      const group = result.results.find(entry => entry.dataset_id === dataset.slug)!;
      expect(group.overall.count).toBe(2);
      expect(group.overall.mean).toBe(15);
      // Only the unit containing (1, 1) has data.
      expect(group.units).toHaveLength(1);
    });
  });

  describe('dataset selection', () => {
    it('skips datasets without preview entitlement and reports them', async () => {
      const { dataset: publicDataset } = await seedDataset('visible-ds', [1, 2]);
      const { dataset: privateDataset } = await seedDataset('hidden-ds', [5, 6]);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [privateDataset.id]);

      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processSoilStatistics(job);
      const result = await readJobData(jobId);

      expect(result.skipped_datasets).toEqual([{ id: privateDataset.slug, reason: 'no_preview_entitlement' }]);
      expect(result.results.map(entry => entry.dataset_id)).toEqual([publicDataset.slug]);
    });

    it('fails when an explicitly named dataset has no preview entitlement', async () => {
      const { dataset } = await seedDataset('named-hidden-ds', [1]);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [dataset.id]);

      const filterId = await createFilter([UNIT_A]);
      const { job } = await createActiveJob({ filter_id: filterId, dataset_ids: [dataset.slug] });
      await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_DATASET_NOT_ENTITLED' });
    });

    it('excludes raster datasets, which hold no observations', async () => {
      const { dataset: vectorDataset } = await seedDataset('vector-ds', [1, 2]);
      const rasterDataset = await addDataset('raster-ds', DATASET_BBOX, GISDataType.RASTER);

      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processSoilStatistics(job);
      const result = await readJobData(jobId);

      expect(result.results.map(entry => entry.dataset_id)).toEqual([vectorDataset.slug]);
      expect(result.excluded_datasets.map(entry => entry.id)).not.toContain(vectorDataset.slug);
      // A raster dataset only appears as excluded if the filter matched it at all.
      for (const excluded of result.excluded_datasets) {
        expect(excluded.reason).toBe('raster');
        expect(excluded.id).toBe(rasterDataset.slug);
      }
    });
  });

  /**
   * The only tests in this file that let a real worker run the job.
   *
   * Everything else hand-builds a payload and calls processSoilStatistics directly, which
   * cannot cover this: the identity a job runs under is decided by JobService.createJob,
   * and createActiveJob writes created_by itself. The bug this guards against lived
   * precisely in that gap — the API authorised the caller by their Subject (the email
   * claim) while the processor re-derived entitlements from the raw sub, matched no rows,
   * and fell back to `everyone`'s. So the chain has to start at a real token and a real
   * POST /jobs, and the worker has to be the thing that picks the job up.
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

    /** POSTs the job as the caller and waits for the worker to finish it. */
    const runAsCaller = async (token: string, body: object): Promise<{ jobId: string; data: SoilStatisticsJob }> => {
      const res = await request(app).post('/jobs').set('Authorization', `Bearer ${token}`).send(body).expect(201);
      const jobId = res.body.id;
      const spy = getPgBoss().getSpy<SoilStatisticsJob>(JobQueues.SOIL_STATISTICS);
      await spy.waitForJobWithId(jobId, 'completed');
      return { jobId, data: await readJobData(jobId) };
    };

    it('reads the private datasets the caller is entitled to, and skips the one they are not', async () => {
      const datasetA = await seedPrivateDataset('entitled-a', [10, 20], true);
      const datasetB = await seedPrivateDataset('entitled-b', [30, 40], true);
      const datasetC = await seedPrivateDataset('unentitled-c', [50, 60], false);

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
        type: JobQueues.SOIL_STATISTICS,
        filter_id: filterResponse.body.id,
      });

      // The Subject, not the sub: this is the value the processor looks entitlements up by.
      expect(data.created_by).toBe(CALLER_EMAIL);

      const readDatasets = data.results.map(entry => entry.dataset_id);
      expect(readDatasets).toEqual(expect.arrayContaining([datasetA.slug, datasetB.slug]));

      // C is the negative control. Without it, a change that entitled everything would
      // still satisfy the assertion above.
      expect(readDatasets).not.toContain(datasetC.slug);
      expect(data.skipped_datasets).toEqual([{ id: datasetC.slug, reason: 'no_preview_entitlement' }]);

      // The same Subject decides job ownership, so the caller must be able to read back
      // the job the API just created for them.
      const jobResponse = await request(app).get(`/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      expect(jobResponse.statusCode).toBe(200);
      expect(jobResponse.body.data.created_by).toBe(CALLER_EMAIL);
    });

    it('completes a run naming those datasets explicitly, rather than refusing what enqueue allowed', async () => {
      // Named datasets are gated twice — enforceEntitlements at enqueue time, then again
      // in the processor. If the two gates resolve identity differently the API returns
      // 201 and the job then dies with SST_DATASET_NOT_ENTITLED, which is exactly what a
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
        type: JobQueues.SOIL_STATISTICS,
        filter_id: filterResponse.body.id,
        dataset_ids: [datasetA.slug, datasetB.slug],
      });

      expect(data.results.map(entry => entry.dataset_id)).toEqual(expect.arrayContaining([datasetA.slug, datasetB.slug]));
      expect(data.skipped_datasets).toEqual([]);
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
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: JobQueues.SOIL_STATISTICS,
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
        await processSoilStatistics(job);

        const percentages = updateSpy.mock.calls
          .map(call => (call[1] as Partial<SoilStatisticsJob>).progress_percentage)
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

      await expect(processSoilStatistics(job)).resolves.toBeUndefined();

      const stored = await readJobData(jobId);
      expect(stored.results).toBeUndefined();
    });
  });

  describe('statistics_type', () => {
    it('computes descriptive statistics when the type is absent', async () => {
      const { dataset } = await seedDataset('type-default', [1, 2, 3]);
      const filterId = await createFilter([UNIT_A]);

      const { jobId, job } = await createActiveJob({ filter_id: filterId });
      await processSoilStatistics(job);
      const stored = await readJobData(jobId);

      expect(stored.results.some(entry => entry.dataset_id === dataset.slug)).toBe(true);
      expect(stored.crea_index).toBeUndefined();
    });

    it('fails rather than falling back to descriptive on an unrecognised type', async () => {
      await seedDataset('type-unknown', [1]);
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({
        filter_id: filterId,
        statistics_type: 'not-a-type' as StatisticsType,
      });

      await expect(processSoilStatistics(job)).rejects.toMatchObject({ code: 'SST_UNKNOWN_STATISTICS_TYPE' });

      // Nothing of either product may be written: a wrong name must not silently yield the
      // default one.
      const stored = await readJobData(jobId);
      expect(stored.results).toBeUndefined();
      expect(stored.crea_index).toBeUndefined();
    });
  });

  describe('crea-index', () => {
    it('returns one scored Point per filter geometry, identified by unit_id', async () => {
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await processSoilStatistics(job);
      const stored = await readJobData(jobId);

      expect(stored.unit_count).toBe(2);
      expect(stored.derived_filter_id).toBeNull();
      expect(stored.crea_index.type).toBe('FeatureCollection');
      expect(stored.crea_index.features).toHaveLength(2);

      // Every Point carries its unit_id as `id` — the only join back to units[] — and
      // exactly one property.
      const unitIds = stored.units.map(unit => unit.unit_id).sort();
      expect(stored.crea_index.features.map(feature => feature.id).sort()).toEqual(unitIds);
      for (const feature of stored.crea_index.features) {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry.type).toBe('Point');
        expect(Object.keys(feature.properties)).toEqual(['value']);
        expect(feature.properties.value).toBeGreaterThanOrEqual(0);
        expect(feature.properties.value).toBeLessThanOrEqual(1);
        // Rounded to 3 decimals like every other number in this job's output.
        expect(feature.properties.value).toBe(Number(feature.properties.value.toFixed(3)));
      }

      // None of the descriptive type's output is written.
      expect(stored.results).toBeUndefined();
      expect(stored.truncated).toBeUndefined();
      expect(stored.skipped_datasets).toBeUndefined();
      expect(stored.excluded_datasets).toBeUndefined();
    });

    it('places each Point inside the area it scores', async () => {
      // A C-shaped polygon whose centroid falls in the notch, outside the ring itself: the
      // case ST_PointOnSurface exists for. A marker outside the field would be visibly wrong.
      const cShape: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [3, 0],
            [3, 1],
            [1, 1],
            [1, 2],
            [3, 2],
            [3, 3],
            [0, 3],
            [0, 0],
          ],
        ],
      };
      const filterId = await createFilter([cShape]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await processSoilStatistics(job);
      const stored = await readJobData(jobId);

      const [feature] = stored.crea_index.features;
      const [longitude, latitude] = feature!.geometry.coordinates;
      const entityManager = await getEntityManager();
      const [row] = await entityManager.query(
        `SELECT ST_Within(ST_SetSRID(ST_MakePoint($2, $3), 4326), ug.geom) AS inside
         FROM ${process.env.POSTGRES_SCHEMA}.user_geometries ug WHERE ug.id = $1`,
        [feature!.id, longitude, latitude],
      );
      expect(row.inside).toBe(true);
    });

    it('scores the same area identically on a re-run', async () => {
      const filterId = await createFilter([UNIT_A]);

      const first = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await processSoilStatistics(first.job);
      const second = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await processSoilStatistics(second.job);

      const firstData = await readJobData(first.jobId);
      const secondData = await readJobData(second.jobId);
      expect(secondData.crea_index.features).toEqual(firstData.crea_index.features);
    });

    it('takes its areas from a file, ignoring the filter geometries, and records the derived filter', async () => {
      // Same contract as the descriptive type: with a file, filter_id contributes criteria
      // only, and the file's geometries are persisted under a derived filter.
      const filterId = await createFilter([getPolygonFromBbox([-1, -1, 5, 5])]);
      const file = await addVectorFileWithGeometries(
        'crea-file-units',
        featureCollection([
          { geometry: UNIT_A, properties: { field_name: 'North' } },
          { geometry: UNIT_B, properties: { field_name: 'South' } },
          { geometry: UNIT_A, properties: { field_name: 'North duplicate' } },
        ]),
        { epsg: 4326 },
      );

      const { jobId, job } = await createActiveJob({
        filter_id: filterId,
        file_id: file.slug,
        label_field: 'field_name',
        statistics_type: StatisticsType.CREA_INDEX,
      });
      await processSoilStatistics(job);
      const stored = await readJobData(jobId);

      expect(stored.derived_filter_id).not.toBeNull();
      // Equivalent geometries collapse, so there is no positional correspondence to the
      // file's three rows — which is exactly why the Features carry unit_id.
      expect(stored.unit_count).toBe(2);
      expect(stored.crea_index.features).toHaveLength(2);
      expect(stored.units.find(unit => unit.record_ids.length === 2)!.label).toBe('North; North duplicate');
      // No raster mask is applied by this type, so the area caveat cannot arise.
      expect(stored.units.every(unit => unit.raster_filtered === false)).toBe(true);
    });

    it('reaches 100% with monotonic progress', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await processSoilStatistics(job);

      const stored = await readJobData(jobId);
      expect(stored.progress_percentage).toBe(100);
      expect(stored.progress_description).toContain('Completed');
    });

    it('stops without writing the index when the job is cancelled', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, statistics_type: StatisticsType.CREA_INDEX });
      await setJobState(jobId, 'cancelled');

      await expect(processSoilStatistics(job)).resolves.toBeUndefined();

      const stored = await readJobData(jobId);
      expect(stored.crea_index).toBeUndefined();
    });
  });
});
