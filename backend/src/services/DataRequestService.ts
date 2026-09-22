import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { DataRequest, DataRequestParameters } from '../interfaces/DataRequest';
import { DataRequestJob, DataRequestJobParameters, Job } from '../interfaces/Job';
import { DataRequestOutput } from '../jobs/data-requests/types';
import { DataRequestRecord, deleteDataRequest, findDataRequest } from '../data-layer/DataRequests';
import { DataRequestStatus, JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { log } from '../utils/logger';
import JobService from './JobService';

/**
 * Job states that mean "this Run is not a Data Request any caller may see".
 *
 * `cancelled` is the load-bearing one. DELETE destroys the record but leaves the pg-boss row
 * behind in `cancelled` state until retention, so a read that trusted the job would keep
 * answering 200 for a resource the caller has already destroyed. Treating it as absent is the
 * only reading consistent with DELETE, and it is why `cancelled` is a state no client can
 * observe (docs/adr/0037).
 */
const GONE_JOB_STATES = ['cancelled'];

/** Job states after which a `data_requests` row exists to be read. */
const TERMINAL_JOB_STATES = ['completed', 'failed'];

/** pg-boss state -> the vocabulary a Data Request reports. */
const STATUS_BY_JOB_STATE: Record<string, DataRequestStatus> = {
  created: DataRequestStatus.PENDING,
  retry: DataRequestStatus.PENDING,
  active: DataRequestStatus.RUNNING,
  completed: DataRequestStatus.COMPLETED,
  failed: DataRequestStatus.FAILED,
};

/**
 * The lifecycle of a Data Request: submit, read, destroy (docs/adr/0037).
 *
 * Reads answer from the job while it exists and from the `data_requests` row afterwards, under one
 * id and one contract. JobService is used for the three pg-boss operations that are genuinely
 * shared - enqueue, find, cancel - and for nothing else: its ownership rules are deliberately
 * bypassed, because a Data Request has no owner and possession of the id is the whole of the
 * permission both to read it and to destroy it.
 */
export default class DataRequestService {
  private jobService = new JobService();

  /**
   * Enqueues a Run.
   *
   * A token is honoured if one is present and is never required. What it changes is which Datasets
   * the Run may reach: JobService.createJob enforces PREVIEW on any named `dataset_ids` while the
   * raw token still exists, and writes the Subject into `created_by` so the processor can
   * re-derive the same Entitlements. Without one the Run resolves EVERYONE's Entitlements and sees
   * public Datasets only - a narrower request, not a rejected one.
   *
   * What the token never does is decide who may read or destroy the result.
   */
  createDataRequest = async (requestData: RequestData, parameters: DataRequestJobParameters): Promise<DataRequest> => {
    const job = await this.jobService.createJob(requestData, {
      ...parameters,
      type: JobQueues.DATA_REQUESTS,
    } as DataRequestJob);
    log.info('Data request submitted', { id: job.id, statistics_type: parameters.statistics_type });
    // No record can exist yet: it is written when the Run terminates.
    return this.fromJob(job, null);
  };

  /**
   * One Data Request by id, or 404.
   *
   * The job is consulted first because it is the only source of progress, and it is the only
   * source at all until the Run terminates. Once retention removes it the row answers instead -
   * which is why the row has to be self-sufficient rather than a supplement to the job.
   */
  getDataRequest = async (requestData: RequestData, id: string): Promise<DataRequest> => {
    const job = await this.findLiveJob(id);
    if (job) {
      // The record is read only once the Run has terminated. `data` is unbounded, so fetching it
      // beside a job that is still running would pay for a payload that cannot exist yet.
      const record = TERMINAL_JOB_STATES.includes(job.status) ? await findDataRequest(requestData.entityManager, id) : null;
      return this.fromJob(job, record);
    }

    const record = await findDataRequest(requestData.entityManager, id);
    if (record) {
      return this.fromRecord(record);
    }

    throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
  };

  /**
   * Destroys a Data Request: cancels the Run if one is still cancellable, and deletes the record
   * if one was written. 204 when either happened, 404 when neither was there.
   *
   * Both halves run, never one or the other: a Run that completed seconds ago has both a job and a
   * row, and cancelling without deleting would leave the answer standing. Idempotent by
   * construction, which also sweeps up the row a Run may have written between a DELETE cancelling
   * it and the processor noticing.
   */
  deleteDataRequest = async (requestData: RequestData, id: string): Promise<void> => {
    const job = await this.findLiveJob(id);
    if (job) {
      await this.jobService.cancelJobInQueue(JobQueues.DATA_REQUESTS, id);
    }

    const deleted = await deleteDataRequest(requestData.entityManager, id);
    if (!job && !deleted) {
      throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
    }

    log.info('Data request destroyed', { id, cancelled_job: Boolean(job), deleted_record: deleted });
  };

  /** The job, unless it is in a state that reads as gone. */
  private findLiveJob = async (id: string): Promise<Job | null> => {
    const job = await this.jobService.findJobInQueue(JobQueues.DATA_REQUESTS, id);
    return job && !GONE_JOB_STATES.includes(job.status) ? job : null;
  };

  /**
   * Assembled field by field rather than by spreading `job.data`, for the same reason the record's
   * `request` is: `created_by`, `isDataAdmin` and `isSuperAdmin` sit on that object and must never
   * reach a caller. A spread plus deletions would leak the next field anyone adds.
   */
  private toParameters = (data: DataRequestJob): DataRequestParameters => ({
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
   * A live job as a Data Request, with the payload taken from `record` when the Run has finished.
   *
   * The payload always comes from the row, never from the job: the job has not carried it since
   * 7f717636 removed that write, so a completed Run's answer is read from the same place at minute
   * one as at day ninety. Everything the row cannot know - progress, and the job's own view of a
   * failure - comes from the job.
   */
  private fromJob = (job: Job, record: DataRequestRecord | null): DataRequest => {
    const data = job.data as DataRequestJob;
    const status = STATUS_BY_JOB_STATE[job.status] ?? DataRequestStatus.PENDING;

    return {
      id: job.id!,
      status,
      created_at: job.created_at,
      completed_at: job.completed_at,
      ...(data.progress_percentage !== undefined ? { progress_percentage: data.progress_percentage } : {}),
      ...(data.progress_description !== undefined ? { progress_description: data.progress_description } : {}),
      message: record?.message ?? job.message ?? null,
      request: this.toParameters(data),
      ...(record?.data ? { data: record.data as DataRequestOutput } : {}),
    };
  };

  /** A stored record as a Data Request. No progress: a Run that reached a record has finished. */
  private fromRecord = (record: DataRequestRecord): DataRequest => ({
    id: record.id,
    status: record.status,
    created_at: record.created_at,
    completed_at: record.completed_at,
    message: record.message,
    request: record.request,
    ...(record.data ? { data: record.data as DataRequestOutput } : {}),
  });
}
