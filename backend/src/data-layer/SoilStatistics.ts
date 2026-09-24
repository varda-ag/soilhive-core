import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { TimeAggregation } from '../interfaces/Job';
import { SoilStatisticsRow } from '../jobs/data-requests/types';
import { DepthRanges } from '../types/enums';
import { JobError } from '../errors/JobError';
import { log } from '../utils/logger';
import { round3 } from '../utils/utils';
import { nothingToStage, StagedVariable, stageVariable } from './DataRequests';
import { bucketKeys, depthStartSql, valueCount, yearStartSql } from './Buckets';

export interface SoilStatisticsOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** A Soil Property's Observations or a Soil Index Run's scores. */
  variable: StagedVariable;
  timeAggregation: TimeAggregation;
  depthRanges: DepthRanges;
  /** Limit on `overall` + `results` rows; see docs/adr/0040. */
  maxRows: number;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

export interface SoilStatisticsResult {
  overall: SoilStatisticsRow[];
  results: SoilStatisticsRow[];
}

interface RawRow {
  unit_id?: string;
  dataset_slug: string;
  year_start: number | null;
  depth_start: number | null;
  count: number;
  n_features: number;
  min: number;
  max: number;
  mean: number;
  stddev: number | null;
  /** p05, p25, p50, p75, p95. */
  percentiles: number[];
  depth_min: number | null;
  depth_max: number | null;
  horizons: string[];
  laboratory_methods: string[];
  lower_fence: number;
  upper_fence: number;
  n_outliers_low: number;
  n_outliers_high: number;
  whisker_low: number;
  whisker_high: number;
}

const METRICS = `
  COUNT(*)::int AS count,
  COUNT(DISTINCT feature_id)::int AS n_features,
  MIN(value) AS min,
  MAX(value) AS max,
  AVG(value) AS mean,
  STDDEV_SAMP(value) AS stddev,
  percentile_cont(ARRAY[0.05, 0.25, 0.5, 0.75, 0.95]) WITHIN GROUP (ORDER BY value) AS percentiles,
  MIN(min_depth)::int AS depth_min,
  MAX(max_depth)::int AS depth_max,
  COALESCE(ARRAY_AGG(DISTINCT horizon) FILTER (WHERE horizon IS NOT NULL), '{}') AS horizons,
  COALESCE(ARRAY_AGG(DISTINCT laboratory_method) FILTER (WHERE laboratory_method IS NOT NULL), '{}') AS laboratory_methods`;

/**
 * Statistics grouped by `keys` over `source`, with Tukey fences from each group's own quartiles.
 * Keys can be null (the no-year / no-depth buckets), hence IS NOT DISTINCT FROM.
 */
const statisticsSql = (source: string, keys: string[]): string => {
  const groupBy = keys.join(', ');
  const sameGroup = keys.map(key => `s.${key} IS NOT DISTINCT FROM q.${key}`).join(' AND ');
  return `
    quartiles AS (
      SELECT ${groupBy},
             percentile_cont(0.25) WITHIN GROUP (ORDER BY value) AS q1,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS q3
      FROM ${source}
      GROUP BY ${groupBy}
    ),
    fenced AS (
      SELECT s.*, q.q1 - 1.5 * (q.q3 - q.q1) AS lower_fence, q.q3 + 1.5 * (q.q3 - q.q1) AS upper_fence
      FROM ${source} s
      JOIN quartiles q ON ${sameGroup}
    )
    SELECT ${groupBy}, ${METRICS},
      MIN(lower_fence) AS lower_fence,
      MIN(upper_fence) AS upper_fence,
      COUNT(*) FILTER (WHERE value < lower_fence)::int AS n_outliers_low,
      COUNT(*) FILTER (WHERE value > upper_fence)::int AS n_outliers_high,
      MIN(value) FILTER (WHERE value >= lower_fence) AS whisker_low,
      MAX(value) FILTER (WHERE value <= upper_fence) AS whisker_high
    FROM fenced
    GROUP BY ${groupBy}`;
};

/** The `descriptive` product: per-unit rows plus pre-fan-out `overall` rows, same bucketing (docs/adr/0040). */
export const computeSoilStatistics = async (
  entityManager: EntityManager,
  options: SoilStatisticsOptions,
): Promise<SoilStatisticsResult> => {
  const { filter, unitIds, datasetSlugs, variable, timeAggregation, depthRanges, maxRows } = options;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (nothingToStage(variable, unitIds, datasetSlugs)) {
    return { overall: [], results: [] };
  }

  return entityManager.transaction(async em => {
    await em.query(`SET LOCAL work_mem = '${options.workMem}'`);
    await em.query(`SET LOCAL statement_timeout = ${Math.trunc(options.statementTimeoutMs)}`);

    await stageVariable(em, { filter, unitIds, datasetSlugs, variable, onPhase: progress, assertNotCancelled: checkCancelled });

    const columns = `o.*, ${yearStartSql(timeAggregation)} AS year_start, ${depthStartSql(depthRanges)} AS depth_start`;
    // `overall` reads pre-fan-out, so overlapping units don't count a value twice.
    const bucketed = `
      bucketed AS (SELECT uf.unit_id, ${columns} FROM sst_obs o JOIN sst_unit_features uf ON uf.feature_id = o.feature_id),
      pooled AS (SELECT ${columns} FROM sst_obs o)`;

    // ── size ─────────────────────────────────────────────────────────────────────────
    const [sized]: { row_count: number }[] = await em.query(`
      WITH ${bucketed}
      SELECT
        (SELECT COUNT(*) FROM (SELECT 1 FROM bucketed GROUP BY unit_id, dataset_slug, year_start, depth_start) r)
        + (SELECT COUNT(*) FROM (SELECT 1 FROM pooled GROUP BY dataset_slug, year_start, depth_start) o) AS row_count`);
    const rows = Number(sized?.row_count ?? 0);
    if (rows > maxRows) {
      log.warn('Soil statistics over budget', { rows, max_rows: maxRows });
      throw new JobError('DR_SOIL_STATISTICS_TOO_LARGE', { rows, max_rows: maxRows });
    }
    await progress(`Sized the statistics: ${rows} row(s)`, 55);
    await checkCancelled();

    // ── aggregate ────────────────────────────────────────────────────────────────────
    const overallRows: RawRow[] = await em.query(`
      WITH ${bucketed}, ${statisticsSql('pooled', ['dataset_slug', 'year_start', 'depth_start'])}
      ORDER BY dataset_slug, year_start NULLS LAST, depth_start NULLS LAST`);
    await progress('Computed overall statistics', 70);
    await checkCancelled();

    const unitRows: RawRow[] = await em.query(`
      WITH ${bucketed}, ${statisticsSql('bucketed', ['unit_id', 'dataset_slug', 'year_start', 'depth_start'])}
      ORDER BY dataset_slug, unit_id, year_start NULLS LAST, depth_start NULLS LAST`);
    await progress('Computed per-area statistics', 90);

    const toRow = (raw: RawRow) => toStatisticsRow(raw, options);
    log.info('Soil statistics computed', { overall: overallRows.length, results: unitRows.length, units: unitIds.length });
    return { overall: overallRows.map(toRow), results: unitRows.map(toRow) };
  });
};

const toStatisticsRow = (raw: RawRow, options: SoilStatisticsOptions): SoilStatisticsRow => {
  // Scores have no Dataset, Feature, Layer, method or horizon.
  const scores = 'soilIndexRun' in options.variable;
  const [p05, p25, median, p75, p95] = raw.percentiles.map(round3) as [number, number, number, number, number];
  return {
    ...(scores ? {} : { dataset_id: raw.dataset_slug }),
    ...(raw.unit_id !== undefined ? { unit_id: raw.unit_id } : {}),
    ...bucketKeys(raw.year_start, raw.depth_start, options.timeAggregation, options.depthRanges),
    ...valueCount(raw.count, scores),
    ...(scores ? {} : { n_features: raw.n_features }),
    min: round3(raw.min),
    p05,
    p25,
    median,
    p75,
    p95,
    max: round3(raw.max),
    mean: round3(raw.mean),
    ...(raw.stddev !== null ? { stddev: round3(raw.stddev) } : {}),
    lower_fence: round3(raw.lower_fence),
    upper_fence: round3(raw.upper_fence),
    n_outliers_low: raw.n_outliers_low,
    n_outliers_high: raw.n_outliers_high,
    whisker_low: round3(raw.whisker_low),
    whisker_high: round3(raw.whisker_high),
    ...(raw.depth_min !== null ? { depth_min: raw.depth_min } : {}),
    ...(raw.depth_max !== null ? { depth_max: raw.depth_max } : {}),
    ...(raw.horizons.length > 0 ? { horizons: raw.horizons } : {}),
    ...(raw.laboratory_methods.length > 0 ? { laboratory_methods: raw.laboratory_methods } : {}),
  };
};
