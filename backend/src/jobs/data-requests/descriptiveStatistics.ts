import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { DepthRanges, JobQueues } from '../../types/enums';
import { computeSoilStatistics } from '../../data-layer/SoilStatistics';
import { getDataRequestsMaxCells, getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { parametersProblem } from './parameters';
import { effectiveFilterOf, resolveVariable } from './selectDatasets';
import { SoilStatisticsOutput } from './types';

/** The `descriptive` Statistics Type: Soil Statistics in the CONTEXT.md sense. */
export async function runDescriptiveStatistics(ctx: RunContext, data: DataRequestJob): Promise<SoilStatisticsOutput> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;

  // Re-checked: a processor must not trust job data.
  const problem = parametersProblem(data);
  if (problem) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
  }
  // Required, and checked above.
  const timeAggregation = data.time_aggregation!;
  const depthRanges = data.depth_ranges ?? DepthRanges.NONE;

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  const variable = await resolveVariable(ctx, data);

  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Summarising ${variable.label} over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  const { overall, results } = await computeSoilStatistics(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs: variable.datasetSlugs,
    variable: variable.staged,
    timeAggregation,
    depthRanges,
    maxRows: getDataRequestsMaxCells(),
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${results.length} statistics row(s)`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: variable.datasetSlugs.length,
    rows: results.length,
  });

  // processDataRequest writes the row (docs/adr/0037).
  return { ...variable.header, overall, results };
}
