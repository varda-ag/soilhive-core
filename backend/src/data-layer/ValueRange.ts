import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { DatasetValueRange, ValueRangeFigures } from '../jobs/data-requests/types';
import { round3 } from '../utils/utils';
import { nothingToStage, StagedVariable, stageVariable } from './DataRequests';

export interface ValueRangeOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  /** A Soil Property's Observations or a Soil Index Run's scores. */
  variable: StagedVariable;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

export interface ValueRangeResult {
  overall: ValueRangeFigures;
  datasets: DatasetValueRange[];
}

interface RawFigures {
  dataset_slug: string | null;
  /** 1 on the ROLLUP's grand-total row, 0 on a per-Dataset row. */
  is_total: number;
  count: number;
  n_features: number;
  min: number | null;
  max: number | null;
}

const NONE: ValueRangeResult = { overall: { count: 0, n_features: 0 }, datasets: [] };

const toFigures = (raw: RawFigures): ValueRangeFigures => ({
  count: raw.count,
  n_features: raw.n_features,
  ...(raw.min !== null ? { min: round3(raw.min) } : {}),
  ...(raw.max !== null ? { max: round3(raw.max) } : {}),
});

/** The `value-range` product: count and extremes for the whole request and per Dataset, pre-fan-out. */
export const computeValueRange = async (entityManager: EntityManager, options: ValueRangeOptions): Promise<ValueRangeResult> => {
  const { filter, unitIds, datasetSlugs, variable } = options;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (nothingToStage(variable, unitIds, datasetSlugs)) {
    return NONE;
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

    // ROLLUP's total row counts a shared Feature once, and exists even when the table is empty.
    const rows: RawFigures[] = await em.query(`
      SELECT dataset_slug,
             GROUPING(dataset_slug) AS is_total,
             COUNT(*)::int AS count,
             COUNT(DISTINCT feature_id)::int AS n_features,
             MIN(value) AS min,
             MAX(value) AS max
      FROM sst_obs
      GROUP BY ROLLUP (dataset_slug)
      ORDER BY is_total DESC, dataset_slug`);
    await progress('Computed value range', 90);

    const total = rows.find(row => Number(row.is_total) === 1);
    return {
      overall: total ? toFigures(total) : NONE.overall,
      datasets: rows.filter(row => Number(row.is_total) === 0).map(row => ({ dataset_id: row.dataset_slug!, ...toFigures(row) })),
    };
  });
};
