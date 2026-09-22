import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Polygon } from 'geojson';
import { SoilIndexJob } from '../../../src/interfaces/Job';
import { processSoilIndex } from '../../../src/jobs/soil-indexes/SoilIndexJob';
import { initPgBoss, stopPgBoss } from '../../../src/services/PgBoss';
import { JobQueues, SoilIndexType } from '../../../src/types/enums';
import { soilIndexPartition } from '../../../src/data-layer/SoilIndex';
import { getEntityManager } from '../../../src/utils/data-source';
import { getPolygonFromBbox } from '../../../src/utils/geometry';
import { sleep } from '../../../src/utils/utils';
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

const createActiveJob = (data: Partial<SoilIndexJob>) => createActiveRunJob<SoilIndexJob>(JobQueues.SOIL_INDEXES, data);

interface SoilIndexRow {
  unit_id: string;
  soil_index_type: string;
  lon: number;
  lat: number;
  value: number;
  geometry_type: string;
}

/**
 * Reads a Run's scores back through the partitioned parent rather than its partition, so
 * these assertions also prove the ATTACH happened — an unattached staging table would leave
 * every one of them seeing zero rows.
 */
const readSoilIndex = async (run: string): Promise<SoilIndexRow[]> => {
  const entityManager = await getEntityManager();
  return entityManager.query(
    `SELECT "metadata"->>'unit_id' AS unit_id,
            "soil_index_type",
            ST_X("geometry") AS lon,
            ST_Y("geometry") AS lat,
            "value"::float8 AS value,
            GeometryType("geometry") AS geometry_type
     FROM ${process.env.POSTGRES_SCHEMA}.soil_index
     WHERE "run" = $1
     ORDER BY "metadata"->>'unit_id'`,
    [run],
  );
};

const soilIndexPartitionExists = async (run: string): Promise<boolean> => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
    `${process.env.POSTGRES_SCHEMA}.${soilIndexPartition(run)}`,
  ]);
  return row.present;
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
    it('fails rather than guessing when the type is absent', async () => {
      const filterId = await createFilter([UNIT_A]);
      // Required, not defaulted: there is deliberately nothing to fall back to (ADR 0036).
      const { jobId, job } = await createActiveJob({ filter_id: filterId });

      await expect(processSoilIndex(job)).rejects.toMatchObject({ code: 'SI_UNKNOWN_INDEX_TYPE' });

      const stored = await readJobData<SoilIndexJob>(jobId);
      expect(stored.progress_percentage).not.toBe(100);
      expect(await readSoilIndex(jobId)).toHaveLength(0);
    });

    it('fails on an unrecognised type', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({
        filter_id: filterId,
        soil_index_type: 'not-an-index' as SoilIndexType,
      });

      await expect(processSoilIndex(job)).rejects.toMatchObject({ code: 'SI_UNKNOWN_INDEX_TYPE' });
      expect(await readSoilIndex(jobId)).toHaveLength(0);
    });

    it('stores the type on every scored row, so a score outlives the job that explains it', async () => {
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(job);

      const rows = await readSoilIndex(jobId);
      expect(rows).toHaveLength(2);
      expect(rows.every(row => row.soil_index_type === SoilIndexType.CREA_INDEX)).toBe(true);
    });
  });

  describe('crea-index', () => {
    it('writes one scored Point per filter geometry to soil_index, keyed by the job id as the run', async () => {
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(job);
      const stored = await readJobData<SoilIndexJob>(jobId);

      expect(stored.unit_count).toBe(2);
      expect(stored.derived_filter_id).toBeNull();

      // This type contributes no output key at all: the run id the caller needs to reach the
      // rows is the job id it already polled with, so job data has nothing left to add. The one
      // key matching the prefix is `soil_index_type`, which is the input that named the product
      // rather than anything the product produced — asserting the exact list rather than an
      // emptiness makes an output key added later fail here.
      expect(Object.keys(stored).filter(key => key.startsWith('soil_index'))).toEqual(['soil_index_type']);

      const rows = await readSoilIndex(jobId);
      expect(rows).toHaveLength(2);

      // The unit_id lives in metadata and nowhere else: the table has no primary key and no
      // unit column, so this is the only join back to units[].
      const unitIds = stored.units.map(unit => unit.unit_id).sort();
      expect(rows.map(row => row.unit_id)).toEqual(unitIds);
      for (const row of rows) {
        expect(row.geometry_type).toBe('POINT');
        expect(row.value).toBeGreaterThanOrEqual(0);
        expect(row.value).toBeLessThanOrEqual(1);
        // Rounded to 3 decimals like every other number in this job's output.
        expect(row.value).toBe(Number(row.value.toFixed(3)));
      }

      // The descriptive producer did not run: its completion line counts dataset/property
      // groups, this one counts scored areas.
      expect(stored.progress_description).toContain('scored area(s)');
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
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(job);

      expect(await readSoilIndex(jobId)).toHaveLength(1);

      // Joined in SQL straight from the stored geometry to the area it scores, so the
      // containment is asserted on what was persisted rather than on a round-tripped copy.
      const entityManager = await getEntityManager();
      const [row] = await entityManager.query(
        `SELECT ST_Within(si."geometry", ug.geom) AS inside
         FROM ${process.env.POSTGRES_SCHEMA}.soil_index si
         JOIN ${process.env.POSTGRES_SCHEMA}.user_geometries ug ON ug.id = (si."metadata"->>'unit_id')::uuid
         WHERE si."run" = $1`,
        [jobId],
      );
      expect(row.inside).toBe(true);
    });

    it('scores the same area identically on a re-run', async () => {
      const filterId = await createFilter([UNIT_A]);

      const first = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(first.job);
      const second = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(second.job);

      // Two Runs, two partitions, identical content: the scores key off unit_id, which the
      // shared filter makes the same for both.
      const firstRows = await readSoilIndex(first.jobId);
      const secondRows = await readSoilIndex(second.jobId);
      expect(firstRows).toHaveLength(1);
      expect(secondRows).toEqual(firstRows);
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
        soil_index_type: SoilIndexType.CREA_INDEX,
      });
      await processSoilIndex(job);
      const stored = await readJobData<SoilIndexJob>(jobId);

      expect(stored.derived_filter_id).not.toBeNull();
      // Equivalent geometries collapse, so there is no positional correspondence to the
      // file's three rows — which is exactly why the Features carry unit_id.
      expect(stored.unit_count).toBe(2);
      expect(await readSoilIndex(jobId)).toHaveLength(2);
      expect(stored.units.find(unit => unit.record_ids.length === 2)!.label).toBe('North; North duplicate');
      // No raster mask is applied by this type, so the area caveat cannot arise.
      expect(stored.units.every(unit => unit.raster_filtered === false)).toBe(true);
    });

    it('reaches 100% with monotonic progress', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await processSoilIndex(job);

      const stored = await readJobData<SoilIndexJob>(jobId);
      expect(stored.progress_percentage).toBe(100);
      expect(stored.progress_description).toContain('Completed');
    });

    it('stops without writing the index when the job is cancelled', async () => {
      const filterId = await createFilter([UNIT_A]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });
      await setJobState(jobId, 'cancelled');

      await expect(processSoilIndex(job)).resolves.toBeUndefined();

      // A cancelled Run must not leave a partition behind, since with retention deferred
      // nothing would ever come back to drop it.
      expect(await soilIndexPartitionExists(jobId)).toBe(false);
      expect(await readSoilIndex(jobId)).toHaveLength(0);
    });

    it("replaces the run's rows rather than duplicating them when the same job is processed twice", async () => {
      // pg-boss retries reuse the job id, so a retry rebuilds a partition that is already
      // attached. Without the pre-emptive drop the second attempt would fail on the existing
      // table, or worse, double every score in the run.
      const filterId = await createFilter([UNIT_A, UNIT_B]);
      const { jobId, job } = await createActiveJob({ filter_id: filterId, soil_index_type: SoilIndexType.CREA_INDEX });

      await processSoilIndex(job);
      const firstRows = await readSoilIndex(jobId);

      await setJobState(jobId, 'active');
      await processSoilIndex(job);

      const secondRows = await readSoilIndex(jobId);
      expect(secondRows).toHaveLength(2);
      expect(secondRows).toEqual(firstRows);
    });
  });
});
