import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { BulkLoadJob, Job } from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { setupQueues, setupWorkers, startPgBoss } from './PgBoss';

let initialized = false;

export default class JobService {
  init = async () => {
    if (initialized) {
      return;
    }
    initialized = true;
    await startPgBoss();
    await setupQueues();
    await setupWorkers();
  };

  createJob = async (requestData: RequestData, datasetSlug: string): Promise<Job> => {
    await this.init();
    const bulkLoadJob: BulkLoadJob = {
      dataset_id: datasetSlug,
      token: requestData.token,
    };
    const boss = getPgBoss();
    const id = await boss.send(JobQueues.BULK_LOAD, bulkLoadJob);
    return { id };
  };

  getJobs = async (_requestData: RequestData): Promise<Job[]> => {
    await this.init();
    const boss = getPgBoss();
    const jobs = await boss.fetch(JobQueues.BULK_LOAD);
    return jobs;
  };

  getJobById = async (requestData: RequestData, jobId: string): Promise<Job> => {
    await this.init();
    const boss = getPgBoss();
    const jobs = await boss.findJobs(JobQueues.BULK_LOAD, { id: jobId });
    if (!jobs.length) {
      throw new ErrorResponse(`Job '${jobId}' not found`, StatusCodes.NOT_FOUND);
    }
    return { id: jobs[0]!.id };
  };

  deleteJobById = async (requestData: RequestData, jobId: string) => {
    await this.init();
    const boss = getPgBoss();
    await boss.cancel(JobQueues.BULK_LOAD, jobId);
  };
}
