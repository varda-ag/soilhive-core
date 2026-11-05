import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { TimeAggregation } from '../interfaces/Job';
import {
  CORRELATION_MAX_POINTS,
  CORRELATION_MIN_POINTS,
  CorrelationOverallRow,
  CorrelationResultRow,
  CorrelationRowKeys,
  CorrelationStatistics,
} from '../jobs/data-requests/types';
import { CorrelationMeasure, DepthRanges } from '../types/enums';
import { JobError } from '../errors/JobError';
import { log } from '../utils/logger';
import { round3 } from '../utils/utils';
import { stageObservations } from './DataRequests';
import { bucketKeys, depthStartSql, yearStartSql } from './Buckets';

export interface CorrelationOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to pair within: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** Soil Property slugs of the two axes. */
  x: string;
  y: string;
  measure: CorrelationMeasure;
  timeAggregation: TimeAggregation;
  /** Limit on `overall` + `results` rows; see docs/adr/0040. */
  maxRows: number;
  /** Limit on the points of all `results` rows together; see docs/adr/0075. */
  maxTotalPoints: number;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

export interface CorrelationResult {
  overall: CorrelationOverallRow[];
  results: CorrelationResultRow[];
}

interface RawStatistics {
  dataset_slug: string;
  year_start: number | null;
  depth_start: number;
  n_points: number;
  pearson_r: number | null;
  spearman_rho: number | null;
  slope: number | null;
  intercept: number | null;
}

interface RawResultRow extends RawStatistics {
  unit_id: string;
  x: number[];
  y: number[];
}

/** One value per location and bucket for the Soil Property `slug` (a SQL placeholder). */
const REDUCERS: Record<CorrelationMeasure, (slug: string) => string> = {
  [CorrelationMeasure.MEAN]: slug => `AVG(value) FILTER (WHERE soil_property_slug = ${slug})`,
  [CorrelationMeasure.MEDIAN]: slug => `percentile_cont(0.5) WITHIN GROUP (ORDER BY value) FILTER (WHERE soil_property_slug = ${slug})`,
};

const OVERALL_KEYS = 'dataset_slug, year_start, depth_start';
const RESULT_KEYS = `unit_id, ${OVERALL_KEYS}`;

/** Average ranks, so ties share a rank: Spearman is the Pearson of these. */
const rankedSql = (source: string, keys: string): string => `
  SELECT s.*,
    RANK() OVER (PARTITION BY ${keys} ORDER BY x) + (COUNT(*) OVER (PARTITION BY ${keys}, x) - 1) / 2.0 AS rank_x,
    RANK() OVER (PARTITION BY ${keys} ORDER BY y) + (COUNT(*) OVER (PARTITION BY ${keys}, y) - 1) / 2.0 AS rank_y
  FROM ${source} s`;

/** Pearson, Spearman and the least-squares fit of y on x; `corr` is null when x or y does not vary. */
const STATISTICS = `
  COUNT(*)::int AS n_points,
  corr(y, x) AS pearson_r,
  corr(rank_y::float8, rank_x::float8) AS spearman_rho,
  regr_slope(y, x) AS slope,
  regr_intercept(y, x) AS intercept`;

/** Aggregated in one order, so x[i] and y[i] stay one location. */
const POINTS = `
  array_agg(x ORDER BY sample_rank) FILTER (WHERE sample_rank <= ${CORRELATION_MAX_POINTS}) AS x,
  array_agg(y ORDER BY sample_rank) FILTER (WHERE sample_rank <= ${CORRELATION_MAX_POINTS}) AS y`;

/** The `correlation` product: per-unit rows with sampled points, plus pre-fan-out `overall` rows. */
export const computeCorrelation = async (entityManager: EntityManager, options: CorrelationOptions): Promise<CorrelationResult> => {
  const { filter, unitIds, datasetSlugs, x, y, measure, timeAggregation, maxRows, maxTotalPoints } = options;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (unitIds.length === 0 || datasetSlugs.length === 0) {
    return { overall: [], results: [] };
  }

  return entityManager.transaction(async em => {
    await em.query(`SET LOCAL work_mem = '${options.workMem}'`);
    await em.query(`SET LOCAL statement_timeout = ${Math.trunc(options.statementTimeoutMs)}`);

    await stageObservations(em, {
      filter,
      unitIds,
      datasetSlugs,
      soilPropertySlugs: [x, y],
      onPhase: progress,
      assertNotCancelled: checkCancelled,
    });

    // ── reduce and pair: x and y of one location in one bucket, never across Datasets ─
    await em.query(
      `CREATE TEMP TABLE sst_pairs ON COMMIT DROP AS
       SELECT * FROM (
         SELECT ${OVERALL_KEYS}, feature_id, ${REDUCERS[measure]('$1')} AS x, ${REDUCERS[measure]('$2')} AS y
         FROM (
           SELECT o.*, ${yearStartSql(timeAggregation)} AS year_start, ${depthStartSql(DepthRanges.STANDARD)} AS depth_start
           FROM sst_obs o
         ) bucketed
         WHERE depth_start IS NOT NULL
         GROUP BY ${OVERALL_KEYS}, feature_id
       ) reduced
       WHERE x IS NOT NULL AND y IS NOT NULL`,
      [x, y],
    );
    await em.query('ANALYZE sst_pairs');

    // Fan-out to units, with a fixed-seed sample order: the hash of the location and the row.
    await em.query(`
      CREATE TEMP TABLE sst_fanned ON COMMIT DROP AS
      SELECT uf.unit_id, p.*,
        ROW_NUMBER() OVER (
          PARTITION BY uf.unit_id, p.dataset_slug, p.year_start, p.depth_start
          ORDER BY md5(p.feature_id::text || ':' || uf.unit_id::text || ':' || p.dataset_slug || ':' || COALESCE(p.year_start::text, '') || ':' || p.depth_start::text)
        ) AS sample_rank
      FROM sst_pairs p
      JOIN sst_unit_features uf ON uf.feature_id = p.feature_id`);
    await em.query('ANALYZE sst_fanned');
    await progress('Paired the values', 50);
    await checkCancelled();

    // ── size ─────────────────────────────────────────────────────────────────────────
    // `overall` reads pre-fan-out, so overlapping units don't count a location twice.
    const [sized]: { row_count: string; point_count: string }[] = await em.query(`
      SELECT
        (SELECT COUNT(*) FILTER (WHERE sample_rank = 1) FROM sst_fanned)
        + (SELECT COUNT(*) FROM (SELECT 1 FROM sst_pairs GROUP BY ${OVERALL_KEYS}) o) AS row_count,
        (SELECT COUNT(*) FILTER (WHERE sample_rank <= ${CORRELATION_MAX_POINTS}) FROM sst_fanned) AS point_count`);
    const rows = Number(sized?.row_count ?? 0);
    const points = Number(sized?.point_count ?? 0);
    if (rows > maxRows || points > maxTotalPoints) {
      log.warn('Correlation over budget', { rows, max_rows: maxRows, points, max_points: maxTotalPoints });
      throw new JobError('DR_CORRELATION_TOO_LARGE', { rows, max_rows: maxRows, points, max_points: maxTotalPoints });
    }
    await progress(`Sized the correlation: ${rows} row(s), ${points} point(s)`, 55);
    await checkCancelled();

    // ── statistics ───────────────────────────────────────────────────────────────────
    const overallRows: RawStatistics[] = await em.query(`
      WITH ranked AS (${rankedSql('sst_pairs', OVERALL_KEYS)})
      SELECT ${OVERALL_KEYS}, ${STATISTICS}
      FROM ranked
      GROUP BY ${OVERALL_KEYS}
      ORDER BY dataset_slug, year_start NULLS LAST, depth_start`);
    await progress('Computed overall correlations', 70);
    await checkCancelled();

    const unitRows: RawResultRow[] = await em.query(`
      WITH ranked AS (${rankedSql('sst_fanned', RESULT_KEYS)})
      SELECT ${RESULT_KEYS}, ${STATISTICS}, ${POINTS}
      FROM ranked
      GROUP BY ${RESULT_KEYS}
      ORDER BY dataset_slug, unit_id, year_start NULLS LAST, depth_start`);
    await progress('Computed per-area correlations', 90);

    log.info('Correlation computed', { overall: overallRows.length, results: unitRows.length, units: unitIds.length, points });
    return {
      overall: overallRows.map(raw => ({ ...rowKeys(raw, timeAggregation), ...statisticsOf(raw) })),
      results: unitRows.map(raw => ({
        ...rowKeys(raw, timeAggregation),
        unit_id: raw.unit_id,
        ...statisticsOf(raw),
        points_truncated: raw.n_points > CORRELATION_MAX_POINTS,
        x: raw.x.map(round3),
        y: raw.y.map(round3),
      })),
    };
  });
};

const rowKeys = (raw: RawStatistics, timeAggregation: TimeAggregation): CorrelationRowKeys => {
  const { depth_end, ...yearKeys } = bucketKeys(raw.year_start, raw.depth_start, timeAggregation, DepthRanges.STANDARD);
  return { dataset_id: raw.dataset_slug, ...yearKeys, depth_start: raw.depth_start, depth_end: depth_end ?? null };
};

/** Only `n_points` below the minimum or when x or y does not vary. */
const statisticsOf = (raw: RawStatistics): CorrelationStatistics => {
  if (raw.n_points < CORRELATION_MIN_POINTS || raw.pearson_r === null) {
    return { n_points: raw.n_points };
  }
  return {
    n_points: raw.n_points,
    pearson_r: round3(raw.pearson_r),
    spearman_rho: round3(raw.spearman_rho!),
    r_squared: round3(raw.pearson_r * raw.pearson_r),
    slope: round3(raw.slope!),
    intercept: round3(raw.intercept!),
  };
};
