import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { Job, SoilIndexJob, SoilIndexJobParameters } from '../interfaces/Job';
import { SoilIndexRun } from '../interfaces/SoilIndexRun';
import {
  destroySoilIndexRun,
  findAttachedSoilIndexRuns,
  findSoilIndexRun,
  findSoilIndexRunAttachment,
  SoilIndexRunRecord,
  toSoilIndexRunParameters,
} from '../data-layer/SoilIndexRuns';
import { forgetSoilIndexTiling } from '../data-layer/SoilIndexTiles';
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

const QUEUE = JobQueues.SOIL_INDEXES;

const notFound = (id: string) => new ErrorResponse(`Soil index run '${id}' not found`, StatusCodes.NOT_FOUND);

/**
 * The lifecycle of a Soil Index Run: submit, read, destroy (docs/adr/0044). The same rules as a Data
 * Request's (docs/adr/0037, 0041): one id, no owner, the job while it lives and the record after.
 * On an attached Run the config item gates the record and its destruction, never the scores.
 */
export default class SoilIndexRunService {
  private jobService = new JobService();

  /** Enqueues a Run. A token only decides which Datasets it may read, never who reads the result. */
  createSoilIndexRun = async (requestData: RequestData, parameters: SoilIndexJobParameters): Promise<SoilIndexRun> => {
    if (parameters.config_id !== undefined) {
      await assertCanAttach(requestData, parameters.config_id, 'soil index runs');
    }
    const job = await this.jobService.createJob(requestData, { ...parameters, type: QUEUE } as SoilIndexJob);
    log.info('Soil index run submitted', { id: job.id, soil_index_type: parameters.soil_index_type });
    return this.fromJob(job, null);
  };

  /** One Run by id, from its job while that exists (the only source of progress), else its record. */
  getSoilIndexRun = async (requestData: RequestData, id: string): Promise<SoilIndexRun> => {
    const job = await findLiveJob(this.jobService, QUEUE, id);
    if (job) {
      await assertConfigAccess(requestData, `Soil index run '${id}'`, (job.data as SoilIndexJob).config_id, Capability.READ);
      const record = TERMINAL_JOB_STATES.includes(job.status) ? await findSoilIndexRun(requestData.entityManager, id) : null;
      return this.fromJob(job, record);
    }

    const record = await findSoilIndexRun(requestData.entityManager, id);
    if (record) {
      await assertConfigAccess(requestData, `Soil index run '${id}'`, record.request.config_id, Capability.READ);
      return this.fromRecord(record);
    }

    throw notFound(id);
  };

  /** Destroys a Run: disposes of its job, then its record, scores and tiles. 404 when none was there. */
  deleteSoilIndexRun = async (requestData: RequestData, id: string): Promise<void> => {
    const job = await findLiveJob(this.jobService, QUEUE, id);
    const attachment = job
      ? { config_id: (job.data as SoilIndexJob).config_id ?? null }
      : await findSoilIndexRunAttachment(requestData.entityManager, id);
    if (!attachment) {
      throw notFound(id);
    }
    await assertConfigAccess(requestData, `Soil index run '${id}'`, attachment.config_id, Capability.WRITE);

    // Cancelled first: a Run about to store its scores either finishes before this, and is then
    // destroyed below, or finds itself cancelled and stores nothing.
    if (job) {
      await disposeJobs(this.jobService, QUEUE, [job]);
    }
    const destroyed = await destroySoilIndexRun(requestData.entityManager, id);
    forgetSoilIndexTiling(id);

    log.info('Soil index run destroyed', { id, disposed_job: Boolean(job), destroyed });
  };

  /**
   * Destroys every Run attached to a config item, as `DELETE /configs/{configId}` does. The caller
   * has already been checked for `write` on the item.
   */
  deleteAttachedSoilIndexRuns = async (requestData: RequestData, configId: string): Promise<void> => {
    const jobs = (await this.jobService.findJobsInQueueByData(QUEUE, { config_id: configId })).filter(
      job => !GONE_JOB_STATES.includes(job.status),
    );
    await disposeJobs(this.jobService, QUEUE, jobs);
    const ids = new Set([...jobs.map(job => job.id!), ...(await findAttachedSoilIndexRuns(requestData.entityManager, configId))]);
    for (const id of ids) {
      await destroySoilIndexRun(requestData.entityManager, id);
      forgetSoilIndexTiling(id);
    }

    log.info('Attached soil index runs destroyed', { config_id: configId, disposed_jobs: jobs.length, destroyed: ids.size });
  };

  /** A live job as a Run, with its outcome from `record` once it has finished. */
  private fromJob = (job: Job, record: SoilIndexRunRecord | null): SoilIndexRun => {
    const data = job.data as SoilIndexJob;
    return {
      id: job.id!,
      status: statusOfJob(job),
      created_at: job.created_at,
      completed_at: job.completed_at,
      ...(data.progress_percentage !== undefined ? { progress_percentage: data.progress_percentage } : {}),
      ...(data.progress_description !== undefined ? { progress_description: data.progress_description } : {}),
      message: record?.message ?? job.message ?? null,
      request: toSoilIndexRunParameters(data),
      ...(record?.data ? { data: record.data } : {}),
    };
  };

  /** A stored record as a Run. No progress: a Run that reached a record has finished. */
  private fromRecord = (record: SoilIndexRunRecord): SoilIndexRun => ({
    id: record.id,
    status: record.status,
    created_at: record.created_at,
    completed_at: record.completed_at,
    message: record.message,
    request: record.request,
    ...(record.data ? { data: record.data } : {}),
  });
}
