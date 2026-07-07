import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { AnyJob, ExportJob, Job } from '../interfaces/Job';
import { Capability, JobQueues } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata } from 'pg-boss';
import { createSignedPath } from '../utils/presigned-url';
import EntitlementService from './EntitlementService';
import { log } from '../utils/logger';

const entitlementService = new EntitlementService();

export default class JobService {
  private boss = getPgBoss();

  async createJob(requestData: RequestData, data: AnyJob): Promise<Job> {
    const { sub } = requestData.token ?? {};

    // Checking preconditions
    if (data.type === JobQueues.BULK_LOAD || data.type === JobQueues.FILE_TO_DB || data.type === JobQueues.BULK_DELETE) {
      if (!sub) {
        throw new ErrorResponse(`Authentication required for ${data.type} jobs`, StatusCodes.UNAUTHORIZED);
      }
      if (data.anonymous) {
        throw new ErrorResponse(`Parameter anonymous: true not allowed for ${data.type} jobs`, StatusCodes.BAD_REQUEST);
      }
    }

    // Checking entitlements
    if (data.type === JobQueues.EXPORT) {
      await entitlementService.enforceEntitlements(requestData, (data as ExportJob).dataset_ids, Capability.DOWNLOAD);
    }

    // Set owner and enqueue the job
    data.created_by = sub ?? null;
    data.isDataAdmin = requestData.token?.isDataAdmin;
    data.isSuperAdmin = requestData.token?.isSuperAdmin;

    const id = await this.boss.send(data.type, data);
    if (!id) {
      throw new ErrorResponse('Failed to create job', StatusCodes.INTERNAL_SERVER_ERROR);
    }
    log.info('Job created', { queue: data.type, job_id: id, created_by: data.created_by ?? null });
    return this.getJobById(requestData, id);
  }

  getJobs = async (requestData: RequestData): Promise<Job[]> => {
    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Authentication required to list jobs', StatusCodes.UNAUTHORIZED);
    }
    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();

    // Filter jobs to only include those created by the user.
    // j.data === null for CLEANUP_ORPHAN_FILES jobs.
    const userJobs = jobs.map(j => this.translateJob(j)).filter(j => !sub || j.data?.created_by === sub);

    log.info('Jobs listed', { count: userJobs.length, user: sub });
    return userJobs.map(job => this.prepareJobForResponse(job));
  };

  getJobById = async (requestData: RequestData, jobId: string): Promise<Job> => {
    const { sub } = requestData.token ?? {};

    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue, { id: jobId }));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();
    if (jobs.length) {
      // Check ownership
      const job = this.translateJob(jobs[0]!);
      if (job.data.created_by && job.data.created_by !== sub) {
        throw new ErrorResponse('Unauthorized to access this job', StatusCodes.UNAUTHORIZED);
      }
      return this.prepareJobForResponse(job);
    }
    throw new ErrorResponse(`Job '${jobId}' not found`, StatusCodes.NOT_FOUND);
  };

  deleteJobById = async (requestData: RequestData, jobId: string) => {
    const { sub } = requestData.token ?? {};
    const job = await this.getJobById(requestData, jobId);
    if (sub && job.data.created_by && job.data.created_by !== sub) {
      throw new ErrorResponse('Unauthorized to delete this job', StatusCodes.UNAUTHORIZED);
    }
    log.info('Job cancelled', { job_id: jobId, user: sub ?? null });
    await this.boss.cancel(job.queue, jobId);
  };

  private translateJob = (job: JobWithMetadata<unknown>): Job => {
    return {
      id: job.id,
      queue: job.name,
      status: job.state,
      created_at: job.createdOn,
      completed_at: job.completedOn,
      data: job.data as AnyJob,
      message: job.output?.['message'],
    };
  };

  private prepareJobForResponse(job: Job): Job {
    const { data, queue, status } = job;

    // Check if it's the right queue, status, and safely check for the property
    if (queue === JobQueues.EXPORT && status === 'completed' && 'download_path' in data && data.download_path) {
      return {
        ...job,
        data: {
          ...data,
          download_path: createSignedPath(data.download_path, 30),
        },
      };
    }

    return job;
  }
}
