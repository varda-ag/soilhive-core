import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { DepthRanges, JobQueues } from '../../types/enums';
import { computeClassDistribution } from '../../data-layer/ClassDistribution';
import { getDataRequestsMaxClassEntries, getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { parametersProblem } from './parameters';
import { effectiveFilterOf, resolveVariable } from './selectDatasets';
import { ClassDistributionOutput, DEFAULT_TIME_AGGREGATION } from './types';

/** The `class-distribution` Statistics Type: a Class Distribution in the CONTEXT.md sense. */
export async function runClassDistribution(ctx: RunContext, data: DataRequestJob): Promise<ClassDistributionOutput> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;

  // Re-checked: a processor must not trust job data.
  const problem = parametersProblem(data);
  if (problem) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
  }
  const { value_type: valueType } = data as Required<Pick<DataRequestJob, 'value_type'>> & DataRequestJob;
  const classSource = data.classes ? { classes: data.classes } : { method: data.class_method!, count: data.class_count! };
  const timeAggregation = data.time_aggregation ?? DEFAULT_TIME_AGGREGATION;
  const depthRanges = data.depth_ranges ?? DepthRanges.NONE;

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  const resolved = await resolveVariable(ctx, data);

  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Distributing ${resolved.label} over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  const {
    classes,
    observedMin,
    observedMax,
    rows: results,
  } = await computeClassDistribution(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs: resolved.datasetSlugs,
    variable: resolved.staged,
    classSource,
    timeAggregation,
    depthRanges,
    valueType,
    maxClassEntries: getDataRequestsMaxClassEntries(),
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description:
      'count' in classSource && classes.length < classSource.count
        ? `Completed: ${results.length} class distribution row(s); ${classSource.count} classes requested, ${classes.length} generated`
        : `Completed: ${results.length} class distribution row(s)`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: resolved.datasetSlugs.length,
    rows: results.length,
  });

  // processDataRequest writes the row (docs/adr/0037).
  return {
    ...resolved.header,
    classes,
    ...(observedMin !== null ? { observed_min: observedMin } : {}),
    ...(observedMax !== null ? { observed_max: observedMax } : {}),
    results,
  };
}
