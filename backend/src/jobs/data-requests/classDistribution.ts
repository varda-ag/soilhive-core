import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import SoilPropertyService from '../../services/SoilPropertyService';
import { DepthRanges, JobQueues } from '../../types/enums';
import { computeClassDistribution } from '../../data-layer/ClassDistribution';
import { getDataRequestsMaxClassEntries, getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { classDistributionProblem } from './classDistributionParameters';
import { effectiveFilterOf, selectPermittedDatasets } from './selectDatasets';
import { ClassDistributionOutput, DEFAULT_TIME_AGGREGATION } from './types';

/**
 * The `class-distribution` Statistics Type: a Class Distribution in the CONTEXT.md sense — the
 * share of one Soil Property's Observations in each caller-supplied Class, per (Dataset,
 * Aggregation Unit, Year Window, depth bucket).
 *
 * Datasets are selected and entitled exactly as for `descriptive` (see selectPermittedDatasets),
 * and the Filter's criteria apply unchanged: the variable narrows within them, never widens them.
 */
export async function runClassDistribution(ctx: RunContext, data: DataRequestJob): Promise<ClassDistributionOutput> {
  const { jobId, entityManager, requestData, units, unitIds, report, assertNotCancelled } = ctx;

  // Re-checked even though the enqueue path validates it: a processor must not trust job data.
  const problem = classDistributionProblem(data);
  if (problem) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
  }
  const { variable, classes } = data as Required<Pick<DataRequestJob, 'variable' | 'classes'>> & DataRequestJob;
  const timeAggregation = data.time_aggregation ?? DEFAULT_TIME_AGGREGATION;
  const depthRanges = data.depth_ranges ?? DepthRanges.NONE;

  // Resolved rather than used as given: an old slug still resolves through the slug history, and
  // the staged Observations carry the current one. It may also have been deleted since submission.
  let soilProperty;
  try {
    soilProperty = await new SoilPropertyService().getSoilProperty(requestData, variable.id);
  } catch {
    throw new JobError('DR_UNKNOWN_SOIL_PROPERTY', { soil_property: variable.id });
  }

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  const permitted = await selectPermittedDatasets(ctx, data);

  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Distributing ${soilProperty.slug} in ${permitted.length} dataset(s) over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  const results = await computeClassDistribution(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs: permitted,
    soilPropertySlug: soilProperty.slug,
    classes,
    timeAggregation,
    depthRanges,
    maxClassEntries: getDataRequestsMaxClassEntries(),
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${results.length} class distribution row(s)`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: permitted.length,
    rows: results.length,
  });

  // Handed up rather than written here, as for every Statistics Type (docs/adr/0037).
  return {
    soil_property: soilProperty.slug,
    standard_unit: soilProperty.standard_unit ?? null,
    results,
  };
}
