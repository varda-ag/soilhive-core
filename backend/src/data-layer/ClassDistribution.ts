import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { ClassDefinition, TimeAggregation } from '../interfaces/Job';
import { ClassDistributionRow, ClassValue, UNCLASSIFIED } from '../jobs/data-requests/types';
import { ClassMethod, DepthRanges, ValueType } from '../types/enums';
import { JobError } from '../errors/JobError';
import { log } from '../utils/logger';
import { round3 } from '../utils/utils';
import { nothingToStage, StagedVariable, stageVariable } from './DataRequests';
import { bucketKeys, depthStartSql, valueCount, yearStartSql } from './Buckets';
import { generateClasses, percentilesFor } from '../jobs/data-requests/generateClasses';

export interface ClassDistributionOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** A Soil Property's Observations or a Soil Index Run's scores. */
  variable: StagedVariable;
  /** The caller's (validated) Classes, or how many to generate and how. */
  classSource: { classes: ClassDefinition[] } | { method: ClassMethod; count: number };
  timeAggregation: TimeAggregation;
  depthRanges: DepthRanges;
  valueType: ValueType;
  /** Limit on rows × (classes + 1); see docs/adr/0038. */
  maxClassEntries: number;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

export interface ClassDistributionResult {
  classes: ClassDefinition[];
  /** Null when no Observation is in scope. */
  observedMin: number | null;
  observedMax: number | null;
  rows: ClassDistributionRow[];
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

/** The `class-distribution` product: per (Dataset, unit, Year Window, depth), values per Class. */
export const computeClassDistribution = async (
  entityManager: EntityManager,
  options: ClassDistributionOptions,
): Promise<ClassDistributionResult> => {
  const { filter, unitIds, datasetSlugs, variable, classSource, timeAggregation, depthRanges, maxClassEntries } = options;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);
  const nothing: ClassDistributionResult = {
    classes: 'classes' in classSource ? classSource.classes : [],
    observedMin: null,
    observedMax: null,
    rows: [],
  };
  // Generation can only yield fewer Classes, so size by what was asked for.
  const requestedClasses = 'classes' in classSource ? classSource.classes.length : classSource.count;

  if (nothingToStage(variable, unitIds, datasetSlugs)) {
    return nothing;
  }

  return entityManager.transaction(async em => {
    await em.query(`SET LOCAL work_mem = '${options.workMem}'`);
    await em.query(`SET LOCAL statement_timeout = ${Math.trunc(options.statementTimeoutMs)}`);

    await stageVariable(em, {
      filter,
      unitIds,
      datasetSlugs,
      variable,
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
    // Must group by the same keys as the aggregate below.
    const sized: { row_count: number }[] = await em.query(`
      WITH ${bucketed}
      SELECT COUNT(*)::int AS row_count
      FROM (SELECT 1 FROM bucketed GROUP BY unit_id, dataset_slug, year_start, depth_start) g`);
    const rows = sized[0]?.row_count ?? 0;

    const entries = rows * (requestedClasses + 1);
    if (entries > maxClassEntries) {
      log.warn('Class distribution over budget', { rows, classes: requestedClasses, entries, max_class_entries: maxClassEntries });
      throw new JobError('DR_CLASS_DISTRIBUTION_TOO_LARGE', { rows, entries, max_entries: maxClassEntries });
    }
    await progress(`Sized the distribution: ${rows} row(s)`, 55);
    await checkCancelled();

    // ── classes ──────────────────────────────────────────────────────────────────────
    // Pre-fan-out, so overlapping units don't count an Observation twice.
    const percentiles = 'method' in classSource ? percentilesFor(classSource.method, classSource.count) : [];
    const [extremes]: { min: number | null; max: number | null; percentiles: number[] | null }[] = await em.query(
      `SELECT MIN(value) AS min, MAX(value) AS max,
              percentile_cont($1::float8[]) WITHIN GROUP (ORDER BY value) AS percentiles
       FROM sst_obs`,
      [percentiles],
    );
    if (!extremes || extremes.min === null || extremes.max === null) {
      return nothing;
    }
    const classes =
      'classes' in classSource
        ? classSource.classes
        : generateClasses(classSource.method, classSource.count, (extremes.percentiles ?? []).map(Number));
    if ('method' in classSource && classes.length < classSource.count) {
      log.info('Fewer classes generated than requested', { requested: classSource.count, generated: classes.length });
    }

    // ── distribute ───────────────────────────────────────────────────────────────────
    // One FILTERed count per Class, `[min, max)`; unclassified is the remainder of `count`.
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

    const results = rawRows.map(raw => toRow(raw, classes, options));
    log.info('Class distribution computed', { rows: results.length, units: unitIds.length, classes: classes.length });
    return { classes, observedMin: round3(extremes.min), observedMax: round3(extremes.max), rows: results };
  });
};

const toRow = (raw: RawRow, classes: ClassDefinition[], options: ClassDistributionOptions): ClassDistributionRow => {
  const { timeAggregation, depthRanges, valueType } = options;
  // Scores have no Dataset and no Feature.
  const scores = 'soilIndexRun' in options.variable;
  const valueOf = (n: number) => (valueType === ValueType.COUNT ? n : round3((100 * n) / raw.count));
  const values: ClassValue[] = classes.map((definition, index) => ({
    name: definition.name,
    value: valueOf(raw.class_counts[index] ?? 0),
  }));
  const unclassified = raw.count - raw.class_counts.reduce((total, n) => total + n, 0);
  if (unclassified > 0) {
    values.push({ name: UNCLASSIFIED, value: valueOf(unclassified) });
  }

  return {
    ...(scores ? {} : { dataset_id: raw.dataset_slug }),
    unit_id: raw.unit_id,
    ...bucketKeys(raw.year_start, raw.depth_start, timeAggregation, depthRanges),
    ...(raw.depth_min !== null ? { depth_min: raw.depth_min } : {}),
    ...(raw.depth_max !== null ? { depth_max: raw.depth_max } : {}),
    ...valueCount(raw.count, scores),
    ...(scores ? {} : { n_features: raw.n_features }),
    classes: values,
  };
};
