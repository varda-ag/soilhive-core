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
import { JobQueues } from '../../../src/types/enums';
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
});
