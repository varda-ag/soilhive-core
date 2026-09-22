import { Job } from 'pg-boss';
import { DataRequestJob } from '../../interfaces/Job';
import { DataRequestParameters } from '../../interfaces/DataRequest';
import { DataRequestStatus, StatisticsType } from '../../types/enums';
import { JobError } from '../../errors/JobError';
import { translateJobError, translateQueueMessage } from '../../errors/jobErrorMessages';
import { insertDataRequest } from '../../data-layer/DataRequests';
import { getJobCreatedOn } from '../../services/PgBoss';
import { getEntityManager } from '../../utils/data-source';
import { getErrorMessage } from '../../utils/error';
import { log } from '../../utils/logger';
import { processRun, RunProduct } from '../runs/runContext';
import { runDescriptiveStatistics } from './descriptiveStatistics';
import { DataRequestOutput } from './types';

/**
 * The Statistics Types this queue can compute, and whether each masks by raster filters.
 *
 * One queue serves every Statistics Type rather than a queue per type. What they share is
 * everything that decides *which areas and which data* are in scope — the Filter, the Aggregation
 * Unit resolution and its cap, entitlement re-derivation, cancellation, progress — which is the
 * expensive, subtle half, and which now lives in the Run (see runContext). The cost accepted in
 * exchange: `job.data` holds fields only one type populates (see the DataRequestJob interface),
 * and a client must read `statistics_type` to know which output key to expect.
 *
 * Soil Indexes are the deliberate exception, and they left over cost rather than over meaning: one
 * of their Runs is long enough that sharing a queue starved the short ones behind it (ADR 0036).
 */
const PRODUCERS: Record<StatisticsType, RunProduct<DataRequestJob, DataRequestOutput>> = {
  [StatisticsType.DESCRIPTIVE]: { appliesRasterMask: true, run: runDescriptiveStatistics },
};

/**
 * What a caller reads back, assembled from job data.
 *
 * Deliberately field-by-field rather than by spreading `data` and deleting keys: `created_by`,
 * `isDataAdmin` and `isSuperAdmin` live on the same object, this value is returned verbatim, and
 * the row it lands in has no owner to scope a leak to (docs/adr/0037). A spread would leak them
 * the first time anyone adds a field to CommonJobData.
 *
 * The resolved half defaults rather than being assumed: a Run can fail before its Units exist —
 * RUN_TOO_MANY_UNITS throws during resolution, an unknown filter_id before it.
 */
const toRequest = (data: DataRequestJob): DataRequestParameters => ({
  statistics_type: data.statistics_type,
  filter_id: data.filter_id,
  ...(data.file_id !== undefined ? { file_id: data.file_id } : {}),
  ...(data.label_field !== undefined ? { label_field: data.label_field } : {}),
  ...(data.dataset_ids !== undefined ? { dataset_ids: data.dataset_ids } : {}),
  ...(data.histogram_bins !== undefined ? { histogram_bins: data.histogram_bins } : {}),
  derived_filter_id: data.derived_filter_id ?? null,
  unit_count: data.unit_count ?? 0,
  units: data.units ?? [],
});

/**
 * Display-ready failure copy, resolved the same way JobService resolves a job's `message` so the
 * two agree while both are readable. A JobError's raw message is only its code, so it is
 * translated and its remedies folded in; anything else keeps its own message, passed through the
 * queue-reap translation for the cases where the text came from pg-boss rather than from us.
 */
const failureMessage = (error: unknown): string => {
  if (JobError.isJobError(error)) {
    const { message, actions } = translateJobError(error.code, error.params);
    return [message, ...actions].join(' ');
  }
  return translateQueueMessage(getErrorMessage(error));
};

const recordOutcome = async (
  jobId: string,
  data: DataRequestJob,
  createdAt: Date,
  outcome: { status: DataRequestStatus.COMPLETED; data: DataRequestOutput } | { status: DataRequestStatus.FAILED; message: string },
): Promise<void> => {
  const entityManager = await getEntityManager();
  await insertDataRequest(entityManager, {
    id: jobId,
    status: outcome.status,
    request: toRequest(data),
    data: outcome.status === DataRequestStatus.COMPLETED ? outcome.data : null,
    message: outcome.status === DataRequestStatus.FAILED ? outcome.message : null,
    created_at: createdAt,
    completed_at: new Date(),
  });
};

/**
 * Runs a Data Request and records its outcome — the single write site for the `data_requests`
 * table (docs/adr/0037).
 *
 * It lives here rather than in the product or in `processRun` for one reason each: a product sees
 * only its own success, so a failure written there would have a different author from a success;
 * and `processRun` is shared with the `soil-indexes` queue, which must never write a Data Request
 * because a Soil Index is not one.
 *
 * Three outcomes, three behaviours:
 *  - a payload came back — record `completed`;
 *  - it threw — record `failed`, then **rethrow**, so pg-boss still fails the job and the existing
 *    error surfacing through `data.errors` is untouched;
 *  - nothing came back and nothing threw — the Run was cancelled. Write nothing: cancelling is how
 *    a Data Request is destroyed, and the DELETE that cancelled it has already deleted any row.
 *    That also closes the race where a DELETE lands mid-Run, without re-reading the job's state:
 *    the cancellation check and the decision not to write are the same fact.
 */
export async function processDataRequest(job: Job<DataRequestJob>): Promise<void> {
  const jobId = job.id;
  // Read before the Run rather than after: this is the submission time, and by the time the Run
  // ends the row may already be gone.
  const createdAt = await getJobCreatedOn(jobId);

  let output: DataRequestOutput | undefined;
  try {
    output = await processRun<DataRequestJob, DataRequestOutput>(job, data => {
      // Re-checked here even though the enqueue path validates it: a processor must not trust job data.
      const producer = data.statistics_type ? PRODUCERS[data.statistics_type] : undefined;
      if (!producer) {
        throw new JobError('DR_UNKNOWN_STATISTICS_TYPE', {
          statistics_type: data.statistics_type ?? '(absent)',
          supported: Object.keys(PRODUCERS).join(', '),
        });
      }
      return producer;
    });
  } catch (error) {
    // The failure the caller is told about must not be replaced by a failure to write it down.
    try {
      await recordOutcome(jobId, job.data, createdAt, { status: DataRequestStatus.FAILED, message: failureMessage(error) });
    } catch (writeError) {
      log.error('Failed to record data request failure', { job_id: jobId, error: getErrorMessage(writeError) });
    }
    throw error;
  }

  if (!output) {
    log.info('Data request cancelled, no record written', { job_id: jobId });
    return;
  }

  await recordOutcome(jobId, job.data, createdAt, { status: DataRequestStatus.COMPLETED, data: output });
}
