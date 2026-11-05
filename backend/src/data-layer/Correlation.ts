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
  var_x: number | null;
  var_y: number | null;
}

interface RawResultRow extends RawStatistics {
  unit_id: string;
  x: number[];
  y: number[];
}

const REDUCERS: Record<CorrelationMeasure, string> = {
  [CorrelationMeasure.MEAN]: 'AVG(value)',
  [CorrelationMeasure.MEDIAN]: 'percentile_cont(0.5) WITHIN GROUP (ORDER BY value)',
};

/**
 * Pearson, Spearman (Pearson of average ranks, so ties share a rank) and the least-squares fit of
 * y on x, per group of `keys` over `source`.
 */
const statisticsSql = (source: string, keys: string[], extraColumns = '', extraSelect = ''): string => {
  const groupBy = keys.join(', ');
  return `
    ranked AS (
      SELECT s.*,
        RANK() OVER (PARTITION BY ${groupBy} ORDER BY x) + (COUNT(*) OVER (PARTITION BY ${groupBy}, x) - 1) / 2.0 AS rank_x,
        RANK() OVER (PARTITION BY ${groupBy} ORDER BY y) + (COUNT(*) OVER (PARTITION BY ${groupBy}, y) - 1) / 2.0 AS rank_y
        ${extraColumns}
      FROM ${source} s
    )
    SELECT ${groupBy},
      COUNT(*)::int AS n_points,
      corr(y, x) AS pearson_r,
      corr(rank_y::float8, rank_x::float8) AS spearman_rho,
      regr_slope(y, x) AS slope,
      regr_intercept(y, x) AS intercept,
      var_samp(x) AS var_x,
      var_samp(y) AS var_y
      ${extraSelect}
    FROM ranked
    GROUP BY ${groupBy}`;
};

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

    // ── reduce: one value per location, bucket and Soil Property ────────────────────
    await em.query(`
      CREATE TEMP TABLE sst_reduced ON COMMIT DROP AS
      SELECT dataset_slug, feature_id, year_start, depth_start, soil_property_slug, ${REDUCERS[measure]} AS value
      FROM (
        SELECT o.*, ${yearStartSql(timeAggregation)} AS year_start, ${depthStartSql(DepthRanges.STANDARD)} AS depth_start
        FROM sst_obs o
      ) bucketed
      WHERE depth_start IS NOT NULL
      GROUP BY dataset_slug, feature_id, year_start, depth_start, soil_property_slug`);
    await em.query('CREATE INDEX ON sst_reduced (soil_property_slug, dataset_slug, feature_id, depth_start)');
    await em.query('ANALYZE sst_reduced');

    // ── pair: x and y of one location in one bucket, never across Datasets ─────────
    // COALESCE, not IS NOT DISTINCT FROM, which cannot hash-join.
    await em.query(
      `CREATE TEMP TABLE sst_pairs ON COMMIT DROP AS
       SELECT rx.dataset_slug, rx.feature_id, rx.year_start, rx.depth_start, rx.value AS x, ry.value AS y
       FROM sst_reduced rx
       JOIN sst_reduced ry
         ON ry.dataset_slug = rx.dataset_slug
        AND ry.feature_id = rx.feature_id
        AND ry.depth_start = rx.depth_start
        AND COALESCE(ry.year_start, -1) = COALESCE(rx.year_start, -1)
       WHERE rx.soil_property_slug = $1 AND ry.soil_property_slug = $2`,
      [x, y],
    );
    await em.query('CREATE INDEX ON sst_pairs (feature_id)');
    await em.query('ANALYZE sst_pairs');
    await progress('Paired the values', 50);
    await checkCancelled();

    // `overall` reads pre-fan-out, so overlapping units don't count a location twice.
    const fannedOut = `
      fanned_out AS (SELECT uf.unit_id, p.* FROM sst_pairs p JOIN sst_unit_features uf ON uf.feature_id = p.feature_id)`;

    // ── size ─────────────────────────────────────────────────────────────────────────
    const [sized]: { row_count: string; point_count: string }[] = await em.query(
      `WITH ${fannedOut},
       unit_groups AS (SELECT COUNT(*) AS n FROM fanned_out GROUP BY unit_id, dataset_slug, year_start, depth_start)
       SELECT
         (SELECT COUNT(*) FROM unit_groups)
         + (SELECT COUNT(*) FROM (SELECT 1 FROM sst_pairs GROUP BY dataset_slug, year_start, depth_start) o) AS row_count,
         (SELECT COALESCE(SUM(LEAST(n, $1)), 0) FROM unit_groups) AS point_count`,
      [CORRELATION_MAX_POINTS],
    );
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
      WITH ${statisticsSql('sst_pairs', ['dataset_slug', 'year_start', 'depth_start'])}
      ORDER BY dataset_slug, year_start NULLS LAST, depth_start`);
    await progress('Computed overall correlations', 70);
    await checkCancelled();

    // Fixed-seed sample: the hash of the location and the row orders the points.
    const resultKeys = ['unit_id', 'dataset_slug', 'year_start', 'depth_start'];
    const sampleOrder = `ROW_NUMBER() OVER (
          PARTITION BY ${resultKeys.join(', ')}
          ORDER BY md5(feature_id::text || ':' || unit_id::text || ':' || dataset_slug || ':' || COALESCE(year_start::text, '') || ':' || depth_start::text)
        ) AS sample_rank`;
    const sampled = `
      array_agg(x ORDER BY sample_rank) FILTER (WHERE sample_rank <= ${CORRELATION_MAX_POINTS}) AS x,
      array_agg(y ORDER BY sample_rank) FILTER (WHERE sample_rank <= ${CORRELATION_MAX_POINTS}) AS y`;
    const unitRows: RawResultRow[] = await em.query(`
      WITH ${fannedOut}, ${statisticsSql('fanned_out', resultKeys, `, ${sampleOrder}`, `, ${sampled}`)}
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
  const varies = (variance: number | null) => variance !== null && variance > 0;
  if (raw.n_points < CORRELATION_MIN_POINTS || !varies(raw.var_x) || !varies(raw.var_y)) {
    return { n_points: raw.n_points };
  }
  const pearsonR = raw.pearson_r!;
  return {
    n_points: raw.n_points,
    pearson_r: round3(pearsonR),
    spearman_rho: round3(raw.spearman_rho!),
    r_squared: round3(pearsonR * pearsonR),
    slope: round3(raw.slope!),
    intercept: round3(raw.intercept!),
  };
};
