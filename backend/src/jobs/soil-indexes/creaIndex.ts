import { SoilIndexJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { round3 } from '../../utils/utils';
import { log } from '../../utils/logger';
import { SoilIndexFeature } from './types';
import { RunContext } from '../runs/runContext';
import { writeSoilIndexRun } from '../../data-layer/SoilIndex';

/**
 * MOCK — this is not the CREA index.
 */
const mockIndexValue = (unitId: string): number => {
  let hash = 0;
  for (let index = 0; index < unitId.length; index += 1) {
    hash = (hash * 31 + unitId.charCodeAt(index)) | 0;
  }
  return round3(Math.abs(hash % 1000) / 1000);
};

/**
 * Representative Point for each Aggregation Unit: the centroid when it lies inside the
 * geometry, otherwise a guaranteed-interior point.
 */
const representativePoints = async (ctx: RunContext, unitIds: string[]): Promise<Map<string, { lon: number; lat: number }>> => {
  const schema = process.env.POSTGRES_SCHEMA;
  const rows: { id: string; lon: number | null; lat: number | null }[] = await ctx.entityManager.query(
    `SELECT ug.id, ST_X(p.pt) AS lon, ST_Y(p.pt) AS lat
     FROM ${schema}.user_geometries ug
     CROSS JOIN LATERAL (
       SELECT CASE
         WHEN ST_Within(ST_Centroid(ug.geom), ug.geom) THEN ST_Centroid(ug.geom)
         ELSE ST_PointOnSurface(ug.geom)
       END AS pt
     ) p
     WHERE ug.id = ANY($1::uuid[])`,
    [unitIds],
  );

  const points = new Map<string, { lon: number; lat: number }>();
  for (const row of rows) {
    if (row.lon !== null && row.lat !== null) {
      points.set(row.id, { lon: round3(Number(row.lon)), lat: round3(Number(row.lat)) });
    }
  }
  return points;
};

/**
 * The `crea-index` Soil Index Type: one scored Point per Aggregation Unit.
 * The scores are written to the `soil_index` table, one row per Point, under this job's id as the Run.
 */
export async function runCreaIndex(ctx: RunContext, data: SoilIndexJob): Promise<void> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;

  await report(`Computing the CREA index over ${units.length} area(s)...`, 40);

  await report('Locating areas...', 60);
  const points = await representativePoints(ctx, unitIds);

  // Driven by unitIds, not by the query rows, so the Features come back in Unit order. A
  // Unit whose geometry yields no point is omitted rather than emitted with a null
  // geometry: a Feature that cannot be placed is not a scored location.
  const features: SoilIndexFeature[] = unitIds.flatMap(unitId => {
    const point = points.get(unitId);
    if (!point) {
      log.warn('Aggregation unit produced no representative point', { job_id: jobId, unit_id: unitId });
      return [];
    }
    return [
      {
        type: 'Feature' as const,
        id: unitId,
        geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] as [number, number] },
        properties: { value: mockIndexValue(unitId) },
      },
    ];
  });

  // Checked once more before anything is persisted
  await assertNotCancelled();

  await report('Storing scored areas...', 80);
  const scored = await writeSoilIndexRun(entityManager, jobId, data.soil_index_type, features);

  // Nothing of the output goes into job data: the scores are rows in `soil_index` keyed by
  // this job's id as the Run, and the caller is already holding that id to poll with. The
  // count reaches it only as prose, in the progress description below.
  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${scored} scored area(s)`,
  } as Partial<SoilIndexJob>);

  log.info('Soil index job completed', {
    job_id: jobId,
    queue: JobQueues.SOIL_INDEXES,
    soil_index_type: data.soil_index_type,
    units: units.length,
    features: features.length,
  });
}
