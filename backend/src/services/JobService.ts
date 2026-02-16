import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { BulkLoadJob, ExportJob, Job } from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata } from 'pg-boss';

export default class JobService {
  private boss = getPgBoss();

  createJob = async (requestData: RequestData, data: BulkLoadJob | ExportJob): Promise<Job> => {
    const { sub } = requestData.token ?? {};

    // Checking preconditions
    if (data.type === JobQueues.BULK_LOAD) {
      if (!sub) {
        throw new ErrorResponse('Authentication required for bulk load jobs', StatusCodes.UNAUTHORIZED);
      }
    }

    // Set owner and enqueue the job
    data.created_by = sub ?? null;
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
    const jobs: JobWithMetadata<unknown>[] = [];
    for (const queue of Object.values(JobQueues)) {
      const j = await this.boss.fetch(queue, { includeMetadata: true });
      jobs.push(...j);
    }
    // Filter jobs to only include those created by the user
    return jobs.map(j => this.translateJob(j)).filter(j => !sub || j.data.created_by === sub);
  };

  getJobById = async (requestData: RequestData, jobId: string): Promise<Job> => {
    const { sub } = requestData.token ?? {};
    for (const queue of Object.values(JobQueues)) {
      const jobs: JobWithMetadata<unknown>[] = await this.boss.findJobs(queue, { id: jobId });
      if (jobs.length) {
        // Check ownership
        const job = this.translateJob(jobs[0]!);
        if (job.data.created_by && job.data.created_by !== sub) {
          throw new ErrorResponse('Unauthorized to access this job', StatusCodes.UNAUTHORIZED);
        }
        return job;
      }
    }
    throw new ErrorResponse(`Job '${jobId}' not found`, StatusCodes.NOT_FOUND);
  };

  deleteJobById = async (requestData: RequestData, jobId: string) => {
    const { sub } = requestData.token ?? {};
    const job = await this.getJobById(requestData, jobId);
    if (sub && job.data.created_by !== sub) {
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
      data: job.data as BulkLoadJob | ExportJob,
    };
  };
}
