import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { AnyJob, Job } from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata } from 'pg-boss';
import { createSignedPath } from '../utils/presigned-url';

export default class JobService {
  private boss = getPgBoss();

  createJob = async (requestData: RequestData, data: AnyJob): Promise<Job> => {
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

    // Set owner and enqueue the job
    data.created_by = data.anonymous ? null : (sub ?? null);
    const id = await this.boss.send(data.type, data);
    if (!id) {
      throw new ErrorResponse('Failed to create job', StatusCodes.INTERNAL_SERVER_ERROR);
    }
    return this.getJobById(requestData, id);
  };

  getJobs = async (requestData: RequestData): Promise<Job[]> => {
    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Authentication required to list jobs', StatusCodes.UNAUTHORIZED);
    }
    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();

    // Filter jobs to only include those created by the user
    const userJobs = jobs.map(j => this.translateJob(j)).filter(j => !sub || j.data.created_by === sub);

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
