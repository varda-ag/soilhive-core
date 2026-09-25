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
import { SoilIndexValueRange, ValueRangeOutput } from './types';

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

  const timeAggregation = data.time_aggregation!;
  const { overall, windows, datasets } = await computeValueRange(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs: variable.datasetSlugs,
    variable: variable.staged,
    timeAggregation,
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  const valueCount = overall.n_observations ?? overall.n_scores;
  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${valueCount} value(s) in range`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: variable.datasetSlugs.length,
    values: valueCount,
  });

  // processDataRequest writes the row (docs/adr/0037).
  const windowsKey = timeAggregation === 'none' ? {} : { windows };
  if ('run' in variable.header) {
    // Scores have no Dataset or Feature (docs/adr/0039).
    const withoutFeatures = <T extends { n_features: number }>({ n_features: _nFeatures, ...rest }: T) => rest;
    // Omit loses the n_observations / n_scores union, though the shape is right.
    return {
      ...variable.header,
      ...withoutFeatures(overall),
      ...(timeAggregation === 'none' ? {} : { windows: windows.map(withoutFeatures) }),
    } as SoilIndexValueRange;
  }
  return { ...variable.header, ...overall, ...windowsKey, datasets };
}
