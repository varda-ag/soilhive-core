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
import { JsonStorage } from '../entities/JsonStorage';
import { PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import { Capability, DataRequestStatus, JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { log } from '../utils/logger';
import EntitlementService from './EntitlementService';
import JobService from './JobService';

const entitlementService = new EntitlementService();

/**
 * Job states that mean "this Data Request must be hidden".
 *
 * DELETE destroys the record but leaves the pg-boss row behind in `cancelled` state until
 * retention, so a read that trusted the job would keep answering 200 for a resource the caller has
 * already destroyed. Treating it as absent is the only reading consistent with DELETE, and it is
 * why `cancelled` is a state no client can observe (docs/adr/0037).
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
      await this.assertCanAttach(requestData, parameters.config_id);
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
    const job = await this.findLiveJob(id);
    if (job) {
      await this.assertConfigAccess(requestData, id, (job.data as DataRequestJob).config_id, Capability.READ);
      // The record is read only once the Run has terminated. `data` is unbounded, so fetching it
      // beside a job that is still running would pay for a payload that cannot exist yet.
      const record = TERMINAL_JOB_STATES.includes(job.status) ? await findDataRequest(requestData.entityManager, id) : null;
      return this.fromJob(job, record);
    }

    const record = await findDataRequest(requestData.entityManager, id);
    if (record) {
      await this.assertConfigAccess(requestData, id, record.request.config_id, Capability.READ);
      return this.fromRecord(record);
    }

    throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
  };

  /**
   * Destroys a Data Request: disposes of the Run if one is still there, and deletes the record if
   * one was written. 204 when either happened, 404 when neither was there.
   */
  deleteDataRequest = async (requestData: RequestData, id: string): Promise<void> => {
    const job = await this.findLiveJob(id);
    const attachment = job
      ? { config_id: (job.data as DataRequestJob).config_id ?? null }
      : await findDataRequestAttachment(requestData.entityManager, id);
    if (!attachment) {
      throw new ErrorResponse(`Data request '${id}' not found`, StatusCodes.NOT_FOUND);
    }
    await this.assertConfigAccess(requestData, id, attachment.config_id, Capability.WRITE);

    if (job) {
      await this.disposeJobs([job]);
    }
    const deleted = await deleteDataRequest(requestData.entityManager, id);

    log.info('Data request destroyed', { id, disposed_job: Boolean(job), deleted_record: deleted });
  };

  /**
   * Destroys every Data Request attached to a config item, as `DELETE /config/{configId}` does
   * (docs/adr/0041). The caller has already been checked for `write` on the item.
   */
  deleteAttachedDataRequests = async (requestData: RequestData, configId: string): Promise<void> => {
    const jobs = (await this.jobService.findJobsInQueueByData(JobQueues.DATA_REQUESTS, { config_id: configId })).filter(
      job => !GONE_JOB_STATES.includes(job.status),
    );
    await this.disposeJobs(jobs);
    const deleted = await deleteAttachedDataRequests(requestData.entityManager, configId);

    log.info('Attached data requests destroyed', { config_id: configId, disposed_jobs: jobs.length, deleted_records: deleted });
  };

  /**
   * A terminated job cannot be cancelled (pg-boss only cancels below `completed`), so it is removed
   * instead. A job still running is cancelled and kept: the worker learns it was cancelled by
   * reading that job's own state.
   */
  private disposeJobs = async (jobs: Job[]): Promise<void> => {
    const terminated = jobs.filter(job => TERMINAL_JOB_STATES.includes(job.status)).map(job => job.id!);
    const running = jobs.filter(job => !TERMINAL_JOB_STATES.includes(job.status)).map(job => job.id!);
    if (terminated.length > 0) {
      await this.jobService.deleteJobInQueue(JobQueues.DATA_REQUESTS, terminated);
    }
    if (running.length > 0) {
      await this.jobService.cancelJobInQueue(JobQueues.DATA_REQUESTS, running);
    }
  };

  /**
   * Attaching needs `write` on an existing plugin config item. `findOneBy` skips soft-deleted rows,
   * so a deleted item cannot collect requests after its cascade has run.
   */
  private assertCanAttach = async (requestData: RequestData, configId: string): Promise<void> => {
    if (!PLUGIN_CONFIG_ID_PATTERN.test(configId)) {
      throw new ErrorResponse(
        `Parameter config_id '${configId}' is not a plugin config id: use plugin:{pluginId}:{id}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    const row = await requestData.entityManager.getRepository(JsonStorage).findOneBy({ id: configId });
    if (!row) {
      throw new ErrorResponse(`Config '${configId}' not found: save it before attaching data requests to it`, StatusCodes.NOT_FOUND);
    }
    if (!entitlementService.canWriteConfig(requestData, configId)) {
      throw new ErrorResponse(`User does not have write entitlement for config ${configId}`, StatusCodes.FORBIDDEN);
    }
  };

  /** An attached Data Request is gated by its config item; an unattached one by nothing but its id. */
  private assertConfigAccess = async (
    requestData: RequestData,
    id: string,
    configId: string | null | undefined,
    capability: Capability.READ | Capability.WRITE,
  ): Promise<void> => {
    if (configId && !(await entitlementService.canAccessConfig(requestData, configId, capability))) {
      throw new ErrorResponse(`Data request '${id}' requires ${capability} on its config`, StatusCodes.FORBIDDEN);
    }
  };

  /** The job, unless it is in a state that reads as gone. */
  private findLiveJob = async (id: string): Promise<Job | null> => {
    const job = await this.jobService.findJobInQueue(JobQueues.DATA_REQUESTS, id);
    return job && !GONE_JOB_STATES.includes(job.status) ? job : null;
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
    const status = STATUS_BY_JOB_STATE[job.status] ?? DataRequestStatus.PENDING;

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
