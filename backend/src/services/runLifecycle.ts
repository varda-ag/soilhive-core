import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { Job } from '../interfaces/Job';
import { JsonStorage } from '../entities/JsonStorage';
import { PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import { Capability, DataRequestStatus, JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import EntitlementService from './EntitlementService';
import type JobService from './JobService';

/**
 * The lifecycle shared by the two resources a Run is read and destroyed through: Data Requests
 * (docs/adr/0037, 0041) and Soil Index Runs (docs/adr/0044).
 */

const entitlementService = new EntitlementService();

/**
 * Job states that read as gone. DELETE leaves a cancelled job behind until retention, so a read that
 * trusted it would answer 200 for a resource already destroyed (docs/adr/0037).
 */
export const GONE_JOB_STATES = ['cancelled'];

/** Job states after which the record exists to be read. */
export const TERMINAL_JOB_STATES = ['completed', 'failed'];

const STATUS_BY_JOB_STATE: Record<string, DataRequestStatus> = {
  created: DataRequestStatus.PENDING,
  retry: DataRequestStatus.PENDING,
  active: DataRequestStatus.RUNNING,
  completed: DataRequestStatus.COMPLETED,
  failed: DataRequestStatus.FAILED,
};

/** pg-boss state -> the vocabulary a Run's resource reports. */
export const statusOfJob = (job: Job): DataRequestStatus => STATUS_BY_JOB_STATE[job.status] ?? DataRequestStatus.PENDING;

/** The job, unless it is in a state that reads as gone. */
export const findLiveJob = async (jobService: JobService, queue: JobQueues, id: string): Promise<Job | null> => {
  const job = await jobService.findJobInQueue(queue, id);
  return job && !GONE_JOB_STATES.includes(job.status) ? job : null;
};

/**
 * A terminated job cannot be cancelled (pg-boss only cancels below `completed`), so it is removed
 * instead. A job still running is cancelled and kept: the worker learns it was cancelled by reading
 * that job's own state.
 */
export const disposeJobs = async (jobService: JobService, queue: JobQueues, jobs: Job[]): Promise<void> => {
  const terminated = jobs.filter(job => TERMINAL_JOB_STATES.includes(job.status)).map(job => job.id!);
  const running = jobs.filter(job => !TERMINAL_JOB_STATES.includes(job.status)).map(job => job.id!);
  if (terminated.length > 0) {
    await jobService.deleteJobInQueue(queue, terminated);
  }
  if (running.length > 0) {
    await jobService.cancelJobInQueue(queue, running);
  }
};

/**
 * Attaching needs `write` on an existing plugin config item. `findOneBy` skips soft-deleted rows, so
 * a deleted item cannot collect anything after its cascade has run. `attached` names what is being
 * attached, for the message.
 */
export const assertCanAttach = async (requestData: RequestData, configId: string, attached: string): Promise<void> => {
  if (!PLUGIN_CONFIG_ID_PATTERN.test(configId)) {
    throw new ErrorResponse(
      `Parameter config_id '${configId}' is not a plugin config id: use plugin:{pluginId}:{id}`,
      StatusCodes.BAD_REQUEST,
    );
  }
  const row = await requestData.entityManager.getRepository(JsonStorage).findOneBy({ id: configId });
  if (!row) {
    throw new ErrorResponse(`Config '${configId}' not found: save it before attaching ${attached} to it`, StatusCodes.NOT_FOUND);
  }
  if (!entitlementService.canWriteConfig(requestData, configId)) {
    throw new ErrorResponse(`User does not have write entitlement for config ${configId}`, StatusCodes.FORBIDDEN);
  }
};

/** An attached resource is gated by its config item; an unattached one by nothing but its id. */
export const assertConfigAccess = async (
  requestData: RequestData,
  resource: string,
  configId: string | null | undefined,
  capability: Capability.READ | Capability.WRITE,
): Promise<void> => {
  if (configId && !(await entitlementService.canAccessConfig(requestData, configId, capability))) {
    throw new ErrorResponse(`${resource} requires ${capability} on its config`, StatusCodes.FORBIDDEN);
  }
};
