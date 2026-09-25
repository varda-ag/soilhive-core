import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { TimeAggregation } from '../interfaces/Job';
import { DatasetValueRange, ValueRangeFigures, WindowValueRange } from '../jobs/data-requests/types';
import { DepthRanges } from '../types/enums';
import { round3 } from '../utils/utils';
import { nothingToStage, StagedVariable, stageVariable } from './DataRequests';
import { bucketKeys, valueCount, yearStartSql } from './Buckets';

export interface ValueRangeOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** A Soil Property's Observations or a Soil Index Run's scores. */
  variable: StagedVariable;
  timeAggregation: TimeAggregation;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

export interface ValueRangeResult {
  /** Whole request, all years. */
  overall: ValueRangeFigures;
  /** Whole request per Year Window; empty under `none`. */
  windows: WindowValueRange[];
  datasets: DatasetValueRange[];
}

interface RawFigures {
  dataset_slug: string | null;
  year_start: number | null;
  /** GROUPING() flags: 1 where the column is rolled up. */
  all_datasets: number;
  all_years: number;
  count: number;
  n_features: number;
  min: number | null;
  max: number | null;
}

const nothingFor = (scores: boolean): ValueRangeResult => ({
  overall: { ...valueCount(0, scores), n_features: 0 },
  windows: [],
  datasets: [],
});

const toFigures = (raw: RawFigures, scores: boolean): ValueRangeFigures => ({
  ...valueCount(raw.count, scores),
  n_features: raw.n_features,
  ...(raw.min !== null ? { min: round3(raw.min) } : {}),
  ...(raw.max !== null ? { max: round3(raw.max) } : {}),
});

/** The `value-range` product: count and extremes, request-wide, per Year Window and per Dataset, pre-fan-out. */
export const computeValueRange = async (entityManager: EntityManager, options: ValueRangeOptions): Promise<ValueRangeResult> => {
  const { filter, unitIds, datasetSlugs, variable, timeAggregation } = options;
  const scores = 'soilIndexRun' in variable;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (nothingToStage(variable, unitIds, datasetSlugs)) {
    return nothingFor(scores);
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

    // The () set counts a shared Feature once and exists even when the table is empty.
    const rows: RawFigures[] = await em.query(`
      WITH pooled AS (SELECT o.*, ${yearStartSql(timeAggregation)} AS year_start FROM sst_obs o)
      SELECT dataset_slug,
             year_start,
             GROUPING(dataset_slug) AS all_datasets,
             GROUPING(year_start) AS all_years,
             COUNT(*)::int AS count,
             COUNT(DISTINCT feature_id)::int AS n_features,
             MIN(value) AS min,
             MAX(value) AS max
      FROM pooled
      GROUP BY GROUPING SETS ((), (year_start), (dataset_slug, year_start))
      ORDER BY dataset_slug NULLS FIRST, year_start NULLS LAST`);
    await progress('Computed value range', 90);

    const keys = (raw: RawFigures) => bucketKeys(raw.year_start, null, timeAggregation, DepthRanges.NONE);
    const total = rows.find(row => Number(row.all_datasets) === 1 && Number(row.all_years) === 1);
    return {
      overall: total ? toFigures(total, scores) : nothingFor(scores).overall,
      // Under `none` the one window would repeat `overall`.
      windows:
        timeAggregation === 'none'
          ? []
          : rows
              .filter(row => Number(row.all_datasets) === 1 && Number(row.all_years) === 0)
              .map(row => ({ ...keys(row), ...toFigures(row, scores) })),
      datasets: rows
        .filter(row => Number(row.all_datasets) === 0)
        .map(row => ({ dataset_id: row.dataset_slug!, ...keys(row), ...toFigures(row, scores) })),
    };
  });
};
