import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import { Capability, JobQueues } from '../../types/enums';
import { EntitlementScope } from '../../types/Entitlements';
import { GISDataType } from '../../types/data';
import { computeDataRequest } from '../../data-layer/DataRequests';
import { getDataRequestsMaxCells, getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';

const DEFAULT_HISTOGRAM_BINS = 10;

/**
 * The `descriptive` Statistics Type: Soil Statistics in the CONTEXT.md sense — count, min,
 * max, mean, median, spread and a histogram over the matching Observations, per
 * (Aggregation Unit, Dataset, Soil Property) and, one level finer, per year and depth.
 *
 * Entitlements are gated twice for different reasons. The authoritative check happens at
 * enqueue time in JobService, where the caller's raw token exists; here it can only be
 * re-derived from EVERYONE plus the user's local rows, because a job processor has no raw
 * token and therefore cannot reach the external entitlements endpoint. Consequently a
 * named dataset is rejected up front (fail fast, with a real 403), while in implicit mode
 * unentitled datasets are skipped and listed — a user whose access comes only from the
 * external endpoint may therefore see fewer datasets in implicit mode than they hold.
 */
export async function runDescriptiveStatistics(ctx: RunContext, data: DataRequestJob): Promise<void> {
  const { jobId, entityManager, requestData, filter, units, unitIds, derivedFilterId, report, assertNotCancelled } = ctx;
  const { filter_id, dataset_ids } = data;
  const histogramBins = data.histogram_bins ?? DEFAULT_HISTOGRAM_BINS;

  const entitlementService = new EntitlementService();
  const filterService = new FilterService();

  // The units define the AOI; the criteria come from the source Filter either way. The
  // area is recomputed over the units rather than inherited from the source Filter,
  // because it selects the raster overview resolution for raster-filter masking.
  const effectiveFilter = {
    ...filter,
    geometryIds: unitIds,
    area: units.reduce((total, unit) => total + (unit.area_m2 ?? 0), 0),
  };

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  // ── datasets ───────────────────────────────────────────────────────────────────────
  const candidates = await filterService.getDatasets(requestData, derivedFilterId ?? filter_id);
  const requested = dataset_ids && dataset_ids.length > 0 ? candidates.filter(d => dataset_ids.includes(d.id)) : candidates;

  const vectorDatasets = requested.filter(dataset => dataset.data_type !== GISDataType.RASTER);
  const permitted: string[] = [];
  for (const dataset of vectorDatasets) {
    try {
      await entitlementService.enforceEntitlements(requestData, EntitlementScope.DATASETS, [dataset.id], Capability.PREVIEW);
      permitted.push(dataset.id);
    } catch {
      // Named datasets are rejected at enqueue time, so anything unentitled here came
      // from implicit selection and is skipped rather than failing the whole run.
      if (dataset_ids && dataset_ids.length > 0) {
        throw new JobError('DR_DATASET_NOT_ENTITLED', { dataset_id: dataset.id });
      }
    }
  }

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
}
