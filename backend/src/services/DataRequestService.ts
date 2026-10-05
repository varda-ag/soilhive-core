import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { DataRequest } from '../interfaces/DataRequest';
import { DataRequestJob, DataRequestJobParameters, Job } from '../interfaces/Job';
import { DataRequestOutput } from '../jobs/data-requests/types';
import {
  DataRequestRecord,
  deleteAttachedDataRequests,
  deleteDataRequest,
  findDataRequest,
  findDataRequestAttachment,
  toDataRequestParameters,
} from '../data-layer/DataRequests';
import { Capability, JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { log } from '../utils/logger';
import JobService from './JobService';
import {
  assertCanAttach,
  assertConfigAccess,
  disposeJobs,
  findLiveJob,
  GONE_JOB_STATES,
  statusOfJob,
  TERMINAL_JOB_STATES,
} from './runLifecycle';

/**
 * The lifecycle of a Data Request: submit, read, destroy (docs/adr/0037).
 *
 * Reads answer from the job while it exists and from the `data_requests` row afterwards, under one
 * id and one contract. JobService is used for the three pg-boss operations that are genuinely
 * shared - enqueue, find, cancel - and for nothing else: its ownership rules are deliberately
 * bypassed, because a Data Request has no owner and possession of the id is the whole of the
 * permission both to read it and to destroy it. The exception is an attached Data Request, gated
 * by `read`/`write` on its config item (docs/adr/0041).
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
    if (parameters.config_id !== undefined) {
      await assertCanAttach(requestData, parameters.config_id, 'data requests');
    }
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
    const job = await findLiveJob(this.jobService, JobQueues.DATA_REQUESTS, id);
    if (job) {
      await assertConfigAccess(requestData, `Data request '${id}'`, (job.data as DataRequestJob).config_id, Capability.READ);
      // The record is read only once the Run has terminated. `data` is unbounded, so fetching it
      // beside a job that is still running would pay for a payload that cannot exist yet.
      const record = TERMINAL_JOB_STATES.includes(job.status) ? await findDataRequest(requestData.entityManager, id) : null;
      return this.fromJob(job, record);
    }

    const record = await findDataRequest(requestData.entityManager, id);
    if (record) {
      await assertConfigAccess(requestData, `Data request '${id}'`, record.request.config_id, Capability.READ);
      return this.fromRecord(record);
    }

    throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
  };

  /**
   * Destroys a Data Request: disposes of the Run if one is still there, and deletes the record if
   * one was written. 204 when either happened, 404 when neither was there.
   */
  deleteDataRequest = async (requestData: RequestData, id: string): Promise<void> => {
    const job = await findLiveJob(this.jobService, JobQueues.DATA_REQUESTS, id);
    const attachment = job
      ? { config_id: (job.data as DataRequestJob).config_id ?? null }
      : await findDataRequestAttachment(requestData.entityManager, id);
    if (!attachment) {
      throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
    }
    await assertConfigAccess(requestData, `Data request '${id}'`, attachment.config_id, Capability.WRITE);

    if (job) {
      await disposeJobs(this.jobService, JobQueues.DATA_REQUESTS, [job]);
    }
    const deleted = await deleteDataRequest(requestData.entityManager, id);

    log.info('Data request destroyed', { id, disposed_job: Boolean(job), deleted_record: deleted });
  };

  /**
   * Destroys every Data Request attached to a config item, as `DELETE /configs/{configId}` does
   * (docs/adr/0041). The caller has already been checked for `write` on the item.
   */
  deleteAttachedDataRequests = async (requestData: RequestData, configId: string): Promise<void> => {
    const jobs = (await this.jobService.findJobsInQueueByData(JobQueues.DATA_REQUESTS, { config_id: configId })).filter(
      job => !GONE_JOB_STATES.includes(job.status),
    );
    await disposeJobs(this.jobService, JobQueues.DATA_REQUESTS, jobs);
    const deleted = await deleteAttachedDataRequests(requestData.entityManager, configId);

    log.info('Attached data requests destroyed', { config_id: configId, disposed_jobs: jobs.length, deleted_records: deleted });
  };

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
    const status = statusOfJob(job);

    return {
      id: job.id!,
      status,
      created_at: job.created_at,
      completed_at: job.completed_at,
      ...(data.progress_percentage !== undefined ? { progress_percentage: data.progress_percentage } : {}),
      ...(data.progress_description !== undefined ? { progress_description: data.progress_description } : {}),
      message: record?.message ?? job.message ?? null,
      request: toDataRequestParameters(data),
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
