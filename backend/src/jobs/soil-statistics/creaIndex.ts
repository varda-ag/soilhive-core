import { SoilStatisticsJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { getSoilStatisticsMaxUnits, round3 } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { extractUnitsFromFile, unitsFromFilter, ExtractedUnits } from './extractUnits';
import { CreaIndexCollection, CreaIndexFeature } from './types';
import { ProducerContext } from './producer';

/**
 * MOCK — this is not the CREA index.
 *
 * Deterministic in `unit_id` so that the same area always scores the same: a run repeated
 * over the same fields returns identical numbers, which keeps tests exactly assertable and
 * stops a demo from looking like the index is drifting. That stability is also the hazard —
 * a reproducible value in [0, 1] is indistinguishable from a real one by inspection, so
 * this function is the single place to replace and nothing downstream should be trusted as
 * meaningful until it is.
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
 *
 * The fallback is not defensive coding for a rare case. `extractUnits` deliberately omits
 * `-explodecollections` so that "a MultiPolygon farm of three disjoint parcels is ONE
 * Aggregation Unit" — and the centroid of three disjoint parcels lands in the gap between
 * them. A marker outside the field it scores is visibly wrong on a map, which is why this
 * departs from the plain `ST_Centroid` used elsewhere in the codebase: those centroids are
 * of Features (small, convex sampling locations), not of user-drawn reporting areas.
 */
const representativePoints = async (ctx: ProducerContext, unitIds: string[]): Promise<Map<string, { lon: number; lat: number }>> => {
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
 * The `crea-index` Statistics Type: one scored Point per Aggregation Unit.
 *
 * Shares the Unit resolution with the descriptive type and nothing else — no Dataset
 * selection, no Observations, no entitlement filtering, because the index is per area
 * rather than per (Dataset, Soil Property). Two consequences fall out of that and are
 * intended rather than tolerated:
 *  - the Unit cap applies here too, since it lives inside extractUnits and one Point per
 *    Unit makes this output linear in Unit count, exactly the ceiling docs/adr/0021 is about;
 *  - `raster_filtered` stays false on every Unit — this type applies no raster mask, so
 *    the area caveat the descriptive type sets does not arise.
 */
export async function runCreaIndex(ctx: ProducerContext, data: SoilStatisticsJob): Promise<void> {
  const { jobId, requestData, filter, report, assertNotCancelled } = ctx;
  const { file_id, label_field } = data;

  const maxUnits = getSoilStatisticsMaxUnits();
  const extracted: ExtractedUnits = file_id
    ? await extractUnitsFromFile(requestData, { fileId: file_id, parameters: filter.parameters, labelField: label_field, maxUnits })
    : await unitsFromFilter(requestData, filter.geometryIds);

  if (extracted.unitIds.length > maxUnits) {
    throw new JobError('SST_TOO_MANY_UNITS', { max_units: maxUnits });
  }

  await updateJobState(jobId, {
    derived_filter_id: extracted.derivedFilterId,
    unit_count: extracted.units.length,
    units: extracted.units,
    progress_percentage: 40,
    progress_description: `Computing the CREA index over ${extracted.units.length} area(s)...`,
  } as Partial<SoilStatisticsJob>);
  await assertNotCancelled();

  await report('Locating areas...', 60);
  const points = await representativePoints(ctx, extracted.unitIds);

  // Driven by unitIds, not by the query rows, so the Features come back in Unit order. A
  // Unit whose geometry yields no point is omitted rather than emitted with a null
  // geometry: a Feature that cannot be placed is not a scored location.
  const features: CreaIndexFeature[] = extracted.unitIds.flatMap(unitId => {
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

  const creaIndex: CreaIndexCollection = { type: 'FeatureCollection', features };

  await updateJobState(jobId, {
    crea_index: creaIndex,
    progress_percentage: 100,
    progress_description: `Completed: ${features.length} scored area(s)`,
  } as Partial<SoilStatisticsJob>);

  log.info('Soil statistics job completed', {
    job_id: jobId,
    queue: JobQueues.SOIL_STATISTICS,
    statistics_type: data.statistics_type,
    units: extracted.units.length,
    features: features.length,
  });
}
