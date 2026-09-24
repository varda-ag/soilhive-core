import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { computeValueRange } from '../../data-layer/ValueRange';
import { getDataRequestsStatementTimeoutMs, getDataRequestsWorkMem } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { parametersProblem } from './parameters';
import { effectiveFilterOf, resolveVariable } from './selectDatasets';
import { ValueRangeOutput } from './types';

/** The `value-range` Statistics Type: a Value Range in the CONTEXT.md sense. */
export async function runValueRange(ctx: RunContext, data: DataRequestJob): Promise<ValueRangeOutput> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;

  // Re-checked: a processor must not trust job data.
  const problem = parametersProblem(data);
  if (problem) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
  }
  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  const variable = await resolveVariable(ctx, data);

  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Measuring ${variable.label} over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  const { overall, datasets } = await computeValueRange(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs: variable.datasetSlugs,
    variable: variable.staged,
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${overall.count} value(s) in range`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: variable.datasetSlugs.length,
    values: overall.count,
  });

  // processDataRequest writes the row (docs/adr/0037).
  if ('run' in variable.header) {
    // Scores have no Dataset or Feature (docs/adr/0039).
    const { n_features: _nFeatures, ...counts } = overall;
    return { ...variable.header, ...counts };
  }
  return { ...variable.header, ...overall, datasets };
}
