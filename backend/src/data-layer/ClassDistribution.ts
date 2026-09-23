import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { ClassDefinition } from '../interfaces/Job';
import { ClassDistributionRow, ClassShare, STANDARD_DEPTH_RANGES, UNCLASSIFIED } from '../jobs/data-requests/types';
import { DepthRanges } from '../types/enums';
import { JobError } from '../errors/JobError';
import { log } from '../utils/logger';
import { round3 } from '../utils/utils';
import { stageObservations } from './DataRequests';

export interface ClassDistributionOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** Current slug of the one Soil Property distributed. */
  soilPropertySlug: string;
  /** Already validated: ordered, non-overlapping, each with at least one bound. */
  classes: ClassDefinition[];
  /** Year Window size in years. */
  timeAggregation: number;
  depthRanges: DepthRanges;
  /** Upper bound on rows × (classes + 1), checked before anything is aggregated (docs/adr/0038). */
  maxClassEntries: number;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

interface RawRow {
  unit_id: string;
  dataset_slug: string;
  year_start: number | null;
  depth_start: number | null;
  count: number;
  n_features: number;
  depth_min: number | null;
  depth_max: number | null;
  /** One count per requested Class, in request order. */
  class_counts: number[];
}

/**
 * Year Window start: years are aligned to multiples of N, so a year lands in the same window
 * whatever the data. FLOOR rather than integer division, which truncates towards zero.
 */
const yearStartSql = (timeAggregation: number): string =>
  `CASE WHEN o.year IS NULL THEN NULL ELSE (FLOOR(o.year::numeric / ${timeAggregation}) * ${timeAggregation})::int END`;

/**
 * Standard Depth Range start, by the Layer's depth midpoint; null when either bound is missing.
 * Pooled depths group everything under one constant key, Layers without a depth included.
 */
const depthStartSql = (depthRanges: DepthRanges): string => {
  if (depthRanges === DepthRanges.NONE) {
    return 'NULL::int';
  }
  const bounded = STANDARD_DEPTH_RANGES.filter(range => range.end !== null);
  const last = STANDARD_DEPTH_RANGES[STANDARD_DEPTH_RANGES.length - 1]!;
  const branches = bounded.map(range => `WHEN (o.min_depth + o.max_depth) / 2.0 < ${range.end} THEN ${range.start}`).join('\n        ');
  return `CASE
        WHEN o.min_depth IS NULL OR o.max_depth IS NULL THEN NULL
        ${branches}
        ELSE ${last.start}
      END`;
};

const DEPTH_END_BY_START = new Map(STANDARD_DEPTH_RANGES.map(range => [range.start, range.end]));

/**
 * Computes a Class Distribution — the `class-distribution` product of a Data Request — for one
 * Soil Property over a set of Aggregation Units: per (Dataset, Unit, Year Window, depth bucket),
 * the share of Observations in each Class.
 */
export const computeClassDistribution = async (
  entityManager: EntityManager,
  options: ClassDistributionOptions,
): Promise<ClassDistributionRow[]> => {
  const { filter, unitIds, datasetSlugs, soilPropertySlug, classes, timeAggregation, depthRanges, maxClassEntries } = options;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (unitIds.length === 0 || datasetSlugs.length === 0) {
    return [];
  }
  // Inlined into the SQL below, so asserted here rather than trusted.
  if (!Number.isInteger(timeAggregation) || timeAggregation < 1) {
    throw new Error(`Invalid time aggregation: ${timeAggregation}`);
  }

  return entityManager.transaction(async em => {
    await em.query(`SET LOCAL work_mem = '${options.workMem}'`);
    await em.query(`SET LOCAL statement_timeout = ${Math.trunc(options.statementTimeoutMs)}`);

    await stageObservations(em, {
      filter,
      unitIds,
      datasetSlugs,
      soilPropertySlug,
      onPhase: progress,
      assertNotCancelled: checkCancelled,
    });

    const bucketed = `
      bucketed AS (
        SELECT
          uf.unit_id,
          o.dataset_slug,
          o.feature_id,
          o.min_depth,
          o.max_depth,
          o.value,
          ${yearStartSql(timeAggregation)} AS year_start,
          ${depthStartSql(depthRanges)} AS depth_start
        FROM sst_obs o
        JOIN sst_unit_features uf ON uf.feature_id = o.feature_id
      )`;

    // ── size ─────────────────────────────────────────────────────────────────────────
    // Counted over exactly the keys the aggregate below groups by, or the check would approve a
    // result that is then too large, or reject one that would have fitted.
    const sized: { row_count: number }[] = await em.query(`
      WITH ${bucketed}
      SELECT COUNT(*)::int AS row_count
      FROM (SELECT 1 FROM bucketed GROUP BY unit_id, dataset_slug, year_start, depth_start) g`);
    const rows = sized[0]?.row_count ?? 0;

    const entries = rows * (classes.length + 1);
    if (entries > maxClassEntries) {
      log.warn('Class distribution over budget', { rows, classes: classes.length, entries, max_class_entries: maxClassEntries });
      throw new JobError('DR_CLASS_DISTRIBUTION_TOO_LARGE', { rows, entries, max_entries: maxClassEntries });
    }
    await progress(`Sized the distribution: ${rows} row(s)`, 55);
    await checkCancelled();

    // ── distribute ───────────────────────────────────────────────────────────────────
    // One pass: a FILTERed count per Class, `[min, max)`, an absent bound left unconstrained.
    // Unclassified is not counted here; it is whatever the Classes leave of `count`.
    const params: number[] = [];
    const p = (val: number) => {
      params.push(val);
      return `$${params.length}::float8`;
    };
    const classCounts = classes
      .map(definition => {
        const conditions = [
          ...(definition.min !== undefined ? [`value >= ${p(definition.min)}`] : []),
          ...(definition.max !== undefined ? [`value < ${p(definition.max)}`] : []),
        ];
        return `COUNT(*) FILTER (WHERE ${conditions.join(' AND ')})`;
      })
      .join(',\n          ');

    const rawRows: RawRow[] = await em.query(
      `WITH ${bucketed}
       SELECT
         unit_id,
         dataset_slug,
         year_start,
         depth_start,
         COUNT(*)::int AS count,
         COUNT(DISTINCT feature_id)::int AS n_features,
         MIN(min_depth)::int AS depth_min,
         MAX(max_depth)::int AS depth_max,
         ARRAY[
          ${classCounts}
         ]::int[] AS class_counts
       FROM bucketed
       GROUP BY unit_id, dataset_slug, year_start, depth_start
       ORDER BY dataset_slug, unit_id, year_start NULLS LAST, depth_start NULLS LAST`,
      params,
    );
    await progress('Computed class distribution', 90);

    const results = rawRows.map(raw => toRow(raw, classes, timeAggregation, depthRanges));
    log.info('Class distribution computed', { rows: results.length, units: unitIds.length, classes: classes.length });
    return results;
  });
};

const toRow = (raw: RawRow, classes: ClassDefinition[], timeAggregation: number, depthRanges: DepthRanges): ClassDistributionRow => {
  const share = (n: number) => round3((100 * n) / raw.count);
  const shares: ClassShare[] = classes.map((definition, index) => ({ name: definition.name, value: share(raw.class_counts[index] ?? 0) }));
  const unclassified = raw.count - raw.class_counts.reduce((total, n) => total + n, 0);
  if (unclassified > 0) {
    shares.push({ name: UNCLASSIFIED, value: share(unclassified) });
  }

  return {
    dataset_id: raw.dataset_slug,
    unit_id: raw.unit_id,
    year_start: raw.year_start,
    year_end: raw.year_start === null ? null : raw.year_start + timeAggregation - 1,
    ...(depthRanges === DepthRanges.STANDARD
      ? { depth_start: raw.depth_start, depth_end: raw.depth_start === null ? null : (DEPTH_END_BY_START.get(raw.depth_start) ?? null) }
      : {}),
    ...(raw.depth_min !== null ? { depth_min: raw.depth_min } : {}),
    ...(raw.depth_max !== null ? { depth_max: raw.depth_max } : {}),
    count: raw.count,
    n_features: raw.n_features,
    classes: shares,
  };
};
