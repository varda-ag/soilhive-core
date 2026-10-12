import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { SoilIndexJob } from '../../../src/interfaces/Job';
import { processSoilIndex } from '../../../src/jobs/soil-indexes/SoilIndexJob';
import { initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../../src/services/PgBoss';
import { JobQueues, SoilIndexType } from '../../../src/types/enums';
import { soilIndexPartition } from '../../../src/data-layer/SoilIndex';
import { findSoilIndexRun } from '../../../src/data-layer/SoilIndexRuns';
import { getEntityManager } from '../../../src/utils/data-source';
import { getPolygonFromBbox } from '../../../src/utils/geometry';
import { getSoilIndexMockScores, sleep } from '../../../src/utils/utils';
import { MOCK_SOIL_INDEX_COLUMNS } from '../../../src/jobs/soil-indexes/mockSoilIndexData';
import {
  UNIT_A,
  UNIT_B,
  addVectorFileWithGeometries,
  createActiveRunJob,
  createFilter,
  featureCollection,
  readJobData,
  setJobState,
} from '../runs/runTestHelpers';
import { mockCsv, mockDataServer, mockRow } from './mockDataServer';

// 500 under the test environment; the same as the job uses, whatever it is set to.
const MOCK_SCORES = getSoilIndexMockScores();

const createActiveJob = (data: Partial<SoilIndexJob>) => createActiveRunJob<SoilIndexJob>(JobQueues.SOIL_INDEXES, data);

const schema = () => process.env['POSTGRES_SCHEMA'];

/**
 * A Run's scores summarised through the partitioned parent rather than its partition, so these
 * assertions also prove the ATTACH happened: an unattached partition would read as no scores.
 */
const summarise = async (run: string) => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(
    `SELECT count(*)::int AS count,
            count(*) FILTER (WHERE soil_index_type = $2)::int AS typed,
            count(*) FILTER (WHERE GeometryType(geometry) <> 'POINT')::int AS not_points,
            min(id) AS min_id, max(id) AS max_id, count(DISTINCT id)::int AS distinct_ids,
            min(value)::float8 AS min_value, max(value)::float8 AS max_value,
            count(*) FILTER (WHERE abs(value * 1000 - round(value * 1000)) > 1e-6)::int AS over_3_decimals,
            min(year) AS min_year, max(year) AS max_year,
            md5(string_agg(concat_ws(':', ST_AsText(geometry), value, year), ',' ORDER BY id)) AS fingerprint
     FROM ${schema()}.soil_index
     WHERE run = $1`,
    [run, SoilIndexType.CREA_INDEX],
  );
  return row;
};

const countByUnit = async (run: string): Promise<Map<string, number>> => {
  const entityManager = await getEntityManager();
  const rows: { unit_id: string; count: number }[] = await entityManager.query(
    `SELECT metadata->>'unit_id' AS unit_id, count(*)::int AS count FROM ${schema()}.soil_index WHERE run = $1 GROUP BY 1`,
    [run],
  );
  return new Map(rows.map(row => [row.unit_id, row.count]));
};

const soilIndexPartitionExists = async (run: string): Promise<boolean> => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`${schema()}.${soilIndexPartition(run)}`]);
  return row.present;
};

/** Pre-rendering jobs enqueued for a Run, whatever state a worker has since moved them to. */
const tilesJobsFor = async (run: string): Promise<number> => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(
    `SELECT count(*)::int AS count FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1 AND data->>'run' = $2`,
    [JobQueues.SOIL_INDEX_TILES, run],
  );
  return row.count;
};

const runCrea = async (filterId: string, extra: Partial<SoilIndexJob> = {}) => {
  const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX, ...extra });
  await processSoilIndex(job);
  return jobId;
};

describe('soil-indexes job', () => {
  beforeAll(async () => {
    await initPgBoss();
    await sleep(2000); // pg-boss tables need a moment to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  describe('soil_index_type', () => {
    it('fails rather than guessing when the type is absent, and records why', async () => {
      const filterId = await createFilter([UNIT_A]);
      // Required, not defaulted: there is deliberately nothing to fall back to (ADR 0036).
      const { jobId, job } = await createActiveJob({ filter_id: filterId });

      await expect(processSoilIndex(job)).rejects.toMatchObject({ code: 'SI_UNKNOWN_INDEX_TYPE' });

      const stored = await readJobData<SoilIndexJob>(jobId);
      expect(stored.progress_percentage).not.toBe(100);
      expect((await summarise(jobId)).count).toBe(0);
      // The outcome outlives the job (docs/adr/0044).
      const record = await findSoilIndexRun(await getEntityManager(), jobId);
      expect(record).toMatchObject({ status: 'failed', data: null });
      expect(record!.message).toBeTruthy();
    });

    it('fails on an unrecognised type', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: 'not-an-index' as SoilIndexType });

      await expect(processSoilIndex(job)).rejects.toMatchObject({ code: 'SI_UNKNOWN_INDEX_TYPE' });
      expect((await summarise(jobId)).count).toBe(0);
    });

    it('stores the type on every score, so a score outlives the job that explains it', async () => {
      const run = await runCrea(await createFilter([UNIT_A, UNIT_B]));

      const { count, typed } = await summarise(run);
      expect(typed).toBe(count);
    });
  });

  describe('crea-index mock', () => {
    it(`scores ${MOCK_SCORES} points, numbered 1..n, each within the area it was generated for`, async () => {
      const run = await runCrea(await createFilter([UNIT_A, UNIT_B]));

      const summary = await summarise(run);
      expect(summary).toMatchObject({ count: MOCK_SCORES, not_points: 0, min_id: 1, max_id: MOCK_SCORES, distinct_ids: MOCK_SCORES });

      // Coordinates are rounded to 6 decimals, which may nudge a point onto or just past an edge.
      const entityManager = await getEntityManager();
      const [{ outside }] = await entityManager.query(
        `SELECT count(*)::int AS outside
         FROM ${schema()}.soil_index si
         JOIN ${schema()}.user_geometries ug ON ug.id = (si.metadata->>'unit_id')::uuid
         WHERE si.run = $1 AND NOT ST_DWithin(si.geometry, ug.geom, 0.000001)`,
        [run],
      );
      expect(outside).toBe(0);
    });

    it('shares the points between areas in proportion to their area', async () => {
      const run = await runCrea(await createFilter([UNIT_A, UNIT_B]));
      const entityManager = await getEntityManager();
      const areas: { id: string; area: number }[] = await entityManager.query(
        `SELECT ug.id, ST_Area(ug.geom::geography) AS area
         FROM ${schema()}.user_geometries ug
         WHERE ug.id IN (SELECT DISTINCT (metadata->>'unit_id')::uuid FROM ${schema()}.soil_index WHERE run = $1)`,
        [run],
      );
      const total = areas.reduce((sum, unit) => sum + unit.area, 0);

      const counts = await countByUnit(run);
      for (const unit of areas) {
        // Largest remainder: each piece's share is within one point of exact.
        expect(Math.abs(counts.get(unit.id)! - (MOCK_SCORES * unit.area) / total)).toBeLessThanOrEqual(1);
      }
    });

    it('gives every score a value in [0, 1) to 3 decimals, and a year from 2015 to 2024', async () => {
      const run = await runCrea(await createFilter([UNIT_A]));

      const summary = await summarise(run);
      expect(summary.min_value).toBeGreaterThanOrEqual(0);
      expect(summary.max_value).toBeLessThan(1);
      expect(summary.over_3_decimals).toBe(0);
      expect(summary.min_year).toBe(2015);
      expect(summary.max_year).toBe(2024);
    });

    it('scores the same area identically on a re-run', async () => {
      const filterId = await createFilter([UNIT_A]);

      // Two Runs, two partitions, identical content: the mock is seeded by unit and piece.
      const first = await runCrea(filterId);
      const second = await runCrea(filterId);
      expect((await summarise(second)).fingerprint).toBe((await summarise(first)).fingerprint);
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

      const run = await runCrea(filterId, { file_id: file.slug, label_field: 'field_name' });
      const stored = await readJobData<SoilIndexJob>(run);

      expect(stored.derived_filter_id).not.toBeNull();
      // Equivalent geometries collapse, so there is no positional correspondence to the file's rows.
      expect(stored.unit_count).toBe(2);
      expect((await countByUnit(run)).size).toBe(2);
      expect(stored.units.find(unit => unit.record_ids.length === 2)!.label).toBe('North; North duplicate');
      // No raster mask is applied by this type, so the area caveat cannot arise.
      expect(stored.units.every(unit => unit.raster_filtered === false)).toBe(true);
    });
  });

  describe("the filter's sampling dates", () => {
    it('keep only the scores whose year overlaps them, numbered 1..n, and are recorded on the Run', async () => {
      const filterId = await createFilter([UNIT_A], { min_sampling_date: '2018-06', max_sampling_date: '2019', min_depth: 0 });

      const run = await runCrea(filterId);

      const summary = await summarise(run);
      expect(summary.count).toBeGreaterThan(0);
      expect(summary.count).toBeLessThan(MOCK_SCORES);
      expect(summary).toMatchObject({ min_year: 2018, max_year: 2019, min_id: 1, max_id: summary.count, distinct_ids: summary.count });
      // Copied, since the Filter may be reaped before the Run.
      const record = await findSoilIndexRun(await getEntityManager(), run);
      expect(record!.request).toMatchObject({ min_sampling_date: '2018-06', max_sampling_date: '2019' });
      expect(record!.data!.score_count).toBe(summary.count);
      expect(await readJobData<SoilIndexJob>(run)).toMatchObject({ min_sampling_date: '2018-06', max_sampling_date: '2019' });
    });

    it('keep only scores with no year for a null bound, which the mock never produces, and record the null', async () => {
      const run = await runCrea(await createFilter([UNIT_A], { max_sampling_date: null }));

      expect((await summarise(run)).count).toBe(0);
      const record = await findSoilIndexRun(await getEntityManager(), run);
      expect(record!.request.max_sampling_date).toBeNull();
      expect(record!.request).not.toHaveProperty('min_sampling_date');
    });

    it('are the only criteria applied: the rest are ignored, and nothing is recorded without them', async () => {
      const run = await runCrea(await createFilter([UNIT_A], { min_depth: 0, max_depth: 30 }));

      expect((await summarise(run)).count).toBe(MOCK_SCORES);
      const record = await findSoilIndexRun(await getEntityManager(), run);
      expect(record!.request).not.toHaveProperty('min_sampling_date');
      expect(record!.request).not.toHaveProperty('max_sampling_date');
    });
  });

  describe('crea-index from MOCK_SOIL_INDEX_DATA', () => {
    const server = mockDataServer();

    beforeAll(() => server.start());
    afterAll(() => server.stop());
    // setupTestEnv unsets it again before the next test.
    beforeEach(() => {
      process.env['MOCK_SOIL_INDEX_DATA'] = server.url();
    });

    const scores = async (run: string) => {
      const entityManager = await getEntityManager();
      return entityManager.query(
        `SELECT id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat, value, year, metadata
         FROM ${schema()}.soil_index WHERE run = $1 ORDER BY id`,
        [run],
      );
    };

    it("scores only the rows inside the areas, numbered 1..n by the file's id", async () => {
      server.serve(
        mockCsv(
          mockRow({ id: 7, lon: 1, lat: 1 }), // in A
          mockRow({ id: 3, lon: 3, lat: 3 }), // in B
          mockRow({ id: 5, lon: 10, lat: 10 }), // outside both
          mockRow({ id: 9, lon: 2.2, lat: 2.2 }), // between A and B
          mockRow({ id: 2, lon: 2, lat: 1 }), // on A's edge
        ),
      );

      const run = await runCrea(await createFilter([UNIT_A, UNIT_B]));

      const rows = await scores(run);
      expect(rows.map((row: { id: number; metadata: { id: number } }) => [row.id, row.metadata.id])).toEqual([
        [1, 2],
        [2, 3],
        [3, 7],
      ]);
      expect((await readJobData<SoilIndexJob>(run)).progress_description).toBe('Completed: 3 score(s)');
    });

    it('scores a row inside two overlapping areas once, under the lower unit_id', async () => {
      server.serve(mockCsv(mockRow({ id: 1, lon: 1.5, lat: 1.5 })));

      const run = await runCrea(await createFilter([UNIT_A, getPolygonFromBbox([1, 1, 3, 3])]));

      const { units } = await readJobData<SoilIndexJob>(run);
      expect(units).toHaveLength(2);
      const rows = await scores(run);
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata.unit_id).toBe(units.map(unit => unit.unit_id).sort()[0]);
    });

    it('stores the point as given, index_value to 3 decimals, and the other columns as metadata', async () => {
      server.serve(
        mockCsv(mockRow({ id: 4, lon: 1.123456789, lat: 0.987654321, year: 2011, index_value: 37.08428221219899, usda_texture: 'Loam' })),
      );

      const run = await runCrea(await createFilter([UNIT_A]));

      const [row] = await scores(run);
      expect(row).toMatchObject({ id: 1, lon: 1.123456789, lat: 0.987654321, value: 37.084, year: 2011 });
      const stored = ['lon', 'lat', 'geom_wkt', 'year', 'index_value'];
      expect(Object.keys(row.metadata).sort()).toEqual(
        [...MOCK_SOIL_INDEX_COLUMNS.filter(column => !stored.includes(column)), 'unit_id'].sort(),
      );
      expect(row.metadata).toMatchObject({ id: 4, min_depth_cm: 30, max_depth_cm: 60, usda_texture: 'Loam', model_nema: 1 });
    });

    it('scores identically on a re-run, and from the same rows in another order', async () => {
      const lines = [
        mockRow({ id: 1, lon: 0.5, lat: 0.5 }),
        mockRow({ id: 2, lon: 1.5, lat: 0.5, year: 2019 }),
        mockRow({ id: 3, lon: 3, lat: 3, index_value: 27.7 }),
      ];
      const filterId = await createFilter([UNIT_A, UNIT_B]);

      server.serve(mockCsv(...lines));
      const first = await runCrea(filterId);
      const second = await runCrea(filterId);
      server.serve(mockCsv(...lines.reverse()));
      const reordered = await runCrea(filterId);

      const expected = await scores(first);
      expect(expected).toHaveLength(3);
      expect(await scores(second)).toEqual(expected);
      expect(await scores(reordered)).toEqual(expected);
    });

    it('fails the Run when the file cannot be read, telling the caller neither where it is nor why', async () => {
      server.serve('Forbidden', 403);
      process.env['MOCK_SOIL_INDEX_DATA'] = server.url('/mock.csv?X-Amz-Signature=secret');
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });

      // Never random scores in its place.
      await expect(processSoilIndex(job)).rejects.toMatchObject({ code: 'SI_MOCK_DATA_UNAVAILABLE', detail: 'HTTP 403' });

      expect(await soilIndexPartitionExists(jobId)).toBe(false);
      const record = await findSoilIndexRun(await getEntityManager(), jobId);
      expect(record).toMatchObject({ status: 'failed', data: null });
      expect(record!.message).toBe('The soil index data this server is configured with could not be loaded. Contact your administrator.');
    });

    it("drops the rows whose year falls outside the filter's sampling dates", async () => {
      server.serve(
        mockCsv(
          mockRow({ id: 1, lon: 1, lat: 1, year: 2001 }),
          mockRow({ id: 2, lon: 1, lat: 1, year: 2011 }),
          mockRow({ id: 3, lon: 1, lat: 1, year: 2019 }),
        ),
      );

      const run = await runCrea(await createFilter([UNIT_A], { min_sampling_date: '2010-03-15' }));

      const rows = await scores(run);
      expect(rows.map((row: { id: number; year: number; metadata: { id: number } }) => [row.id, row.year, row.metadata.id])).toEqual([
        [1, 2011, 2],
        [2, 2019, 3],
      ]);
    });

    it('scores random points when the value is blank', async () => {
      process.env['MOCK_SOIL_INDEX_DATA'] = '  ';

      const run = await runCrea(await createFilter([UNIT_A]));

      expect((await summarise(run)).count).toBe(MOCK_SCORES);
    });
  });

  describe('outcome', () => {
    it('records a completed Run with its full request and what it produced, never who asked', async () => {
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const run = await runCrea(filterId);

      const record = await findSoilIndexRun(await getEntityManager(), run);
      expect(record).toMatchObject({
        status: 'completed',
        message: null,
        request: { soil_index_type: SoilIndexType.CREA_INDEX, filter_id: filterId, derived_filter_id: null, unit_count: 2 },
        data: { score_count: MOCK_SCORES, tiles: `/soil-indexes/${run}/tiles` },
      });
      expect(record!.request.units).toHaveLength(2);
      expect(record!.data!.bounds).toHaveLength(4);
      // The record is readable by anyone holding the id (docs/adr/0037).
      expect(Object.keys(record!.request)).not.toEqual(expect.arrayContaining(['created_by']));
      expect(JSON.stringify(record!.request)).not.toContain('isDataAdmin');
    });

    it('reaches 100% with monotonic progress', async () => {
      const run = await runCrea(await createFilter([UNIT_A]));

      const stored = await readJobData<SoilIndexJob>(run);
      expect(stored.progress_percentage).toBe(100);
      expect(stored.progress_description).toBe(`Completed: ${MOCK_SCORES} score(s)`);
    });

    it('stops without writing anything when the job is cancelled', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await setJobState(jobId, 'cancelled');

      await expect(processSoilIndex(job)).resolves.toBeUndefined();

      // A cancelled Run leaves nothing: no partition, no record.
      expect(await soilIndexPartitionExists(jobId)).toBe(false);
      expect(await findSoilIndexRun(await getEntityManager(), jobId)).toBeNull();
    });

    it("replaces the run's scores rather than duplicating them when the same job is processed twice", async () => {
      // pg-boss retries reuse the job id, so a retry rebuilds a partition that is already attached.
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });

      await processSoilIndex(job);
      const first = await summarise(jobId);

      await setJobState(jobId, 'active');
      await processSoilIndex(job);

      const second = await summarise(jobId);
      expect(second.count).toBe(MOCK_SCORES);
      expect(second.fingerprint).toBe(first.fingerprint);
    });
  });

  describe('map tiles', () => {
    it('enqueues pre-rendering once the Run is complete', async () => {
      const run = await runCrea(await createFilter([UNIT_A]));

      expect(await tilesJobsFor(run)).toBe(1);
    });

    it('enqueues nothing for a cancelled Run, which has no partition to tile', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await setJobState(jobId, 'cancelled');
      await processSoilIndex(job);

      expect(await tilesJobsFor(jobId)).toBe(0);
    });
  });
});
