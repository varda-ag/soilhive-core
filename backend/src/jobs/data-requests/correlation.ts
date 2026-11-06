import { DataRequestJob } from '../../interfaces/Job';
import { updateJobState } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { computeCorrelation } from '../../data-layer/Correlation';
import {
  getDataRequestsMaxCells,
  getDataRequestsMaxCorrelationPoints,
  getDataRequestsStatementTimeoutMs,
  getDataRequestsWorkMem,
} from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { RunContext } from '../runs/runContext';
import { parametersProblem, SAME_CORRELATION_VARIABLES } from './parameters';
import { effectiveFilterOf, resolveSoilProperty, selectPermittedDatasets, soilPropertyHeader } from './selectDatasets';
import { CORRELATION_MAX_POINTS, CORRELATION_MIN_POINTS, CorrelationOutput } from './types';

/** The `correlation` Statistics Type: how two Soil Properties vary together at the same locations. */
export async function runCorrelation(ctx: RunContext, data: DataRequestJob): Promise<CorrelationOutput> {
  const { jobId, entityManager, units, unitIds, report, assertNotCancelled } = ctx;

  // Re-checked: a processor must not trust job data.
  const problem = parametersProblem(data);
  if (problem) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
  }
  // Required, and checked above.
  const timeAggregation = data.time_aggregation!;
  const measure = data.measure!;

  await report('Selecting datasets...', 12);
  await assertNotCancelled();

  const x = await resolveSoilProperty(ctx.requestData, data.variable_x!.id);
  const y = await resolveSoilProperty(ctx.requestData, data.variable_y!.id);
  if (x.id === y.id) {
    throw new JobError('DR_INVALID_PARAMETERS', { reason: SAME_CORRELATION_VARIABLES });
  }
  const datasetSlugs = await selectPermittedDatasets(ctx, data);

  await updateJobState(jobId, {
    progress_percentage: 15,
    progress_description: `Correlating ${x.slug} with ${y.slug} over ${units.length} area(s)...`,
  } as Partial<DataRequestJob>);
  await assertNotCancelled();

  const { overall, results } = await computeCorrelation(entityManager, {
    filter: effectiveFilterOf(ctx),
    unitIds,
    datasetSlugs,
    x: x.slug,
    y: y.slug,
    measure,
    timeAggregation,
    maxRows: getDataRequestsMaxCells(),
    maxTotalPoints: getDataRequestsMaxCorrelationPoints(),
    workMem: getDataRequestsWorkMem(),
    statementTimeoutMs: getDataRequestsStatementTimeoutMs(),
    onPhase: report,
    assertNotCancelled,
  });

  await updateJobState(jobId, {
    progress_percentage: 100,
    progress_description: `Completed: ${results.length} correlation row(s)`,
  } as Partial<DataRequestJob>);

  log.info('Data request job completed', {
    job_id: jobId,
    queue: JobQueues.DATA_REQUESTS,
    units: units.length,
    datasets: datasetSlugs.length,
    rows: results.length,
  });

  // processDataRequest writes the row (docs/adr/0037).
  return {
    x: soilPropertyHeader(x),
    y: soilPropertyHeader(y),
    min_points: CORRELATION_MIN_POINTS,
    max_points: CORRELATION_MAX_POINTS,
    overall,
    results,
  };
}
