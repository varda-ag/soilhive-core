import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { computeDataRequest } from '../../data-layer/DataRequests';
import { getDataRequestsMaxCells, getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { effectiveFilterOf, selectPermittedDatasets } from './selectDatasets';
import { SoilStatisticsOutput } from './types';

const DEFAULT_HISTOGRAM_BINS = 10;

/**
 * The `descriptive` Statistics Type: Soil Statistics in the CONTEXT.md sense — count, min,
 * max, mean, median, spread and a histogram over the matching Observations, per
 * (Aggregation Unit, Dataset, Soil Property) and, one level finer, per year and depth.
 *
 * Which Datasets are in scope, and how entitlements gate them, is shared with every other
 * Statistics Type — see selectPermittedDatasets.
 */
export async function runDescriptiveStatistics(ctx: RunContext, data: DataRequestJob): Promise<SoilStatisticsOutput> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;
  const histogramBins = data.histogram_bins ?? DEFAULT_HISTOGRAM_BINS;

  // The units define the AOI; the criteria come from the source Filter either way.
  const effectiveFilter = effectiveFilterOf(ctx);

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  // ── datasets ───────────────────────────────────────────────────────────────────────
  const permitted = await selectPermittedDatasets(ctx, data);

  // derived_filter_id, unit_count and units[] were written by the Run before this producer ran.
  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Aggregating ${permitted.length} dataset(s) over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  // ── statistics ─────────────────────────────────────────────────────────────────────
  const { results, truncated } = await computeDataRequest(entityManager, {
    filter: effectiveFilter,
    unitIds,
    datasetSlugs: permitted,
    histogramBins,
    maxCells: getDataRequestsMaxCells(),
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: truncated
      ? `Completed with a reduced breakdown: ${results.length} dataset/property group(s)`
      : `Completed: ${results.length} dataset/property group(s)`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: permitted.length,
    groups: results.length,
    truncated,
  });

  // Handed up rather than written here: the Data Request row is written by
  // processDataRequest, which is also where a failure is recorded, so one record has one
  // author (docs/adr/0037).
  return { results, truncated };
}
