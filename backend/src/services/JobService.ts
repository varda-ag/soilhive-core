import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { AnyJob, ExportJob, Job, SoilStatisticsJob } from '../interfaces/Job';
import { Capability, JobQueues, StatisticsType } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata, SendOptions } from 'pg-boss';
import { createSignedPath } from '../utils/presigned-url';
import EntitlementService from './EntitlementService';
import FilterService from './FilterService';
import FileService from './FileService';
import { getSubject } from '../utils/auth';
import { log } from '../utils/logger';

const entitlementService = new EntitlementService();

/**
 * The Subject the caller acts under, or undefined when the request carries no token.
 *
 * getSubject throws 401 on a missing sub, which is wrong for the job reads: an anonymous
 * export job (created_by null) is deliberately readable without a token, so absence of a
 * caller has to be representable rather than an error. Routes that do require a caller
 * raise their own 401 before comparing.
 */
const subjectOf = (requestData: RequestData): string | undefined => (requestData.token ? getSubject(requestData) : undefined);

export default class JobService {
  private boss = getPgBoss();

  async createJob(requestData: RequestData, data: AnyJob, options?: SendOptions): Promise<Job> {
    const { sub } = requestData.token ?? {};

    // Checking preconditions
    if (
      data.type === JobQueues.BULK_LOAD ||
      data.type === JobQueues.RASTER_LOAD ||
      data.type === JobQueues.FILE_TO_DB ||
      data.type === JobQueues.BULK_DELETE
    ) {
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

    if (data.type === JobQueues.SOIL_STATISTICS) {
      await this.validateSoilStatisticsJob(requestData, data as SoilStatisticsJob);
    }

    // Set owner and enqueue the job. created_by holds the Subject, not the raw sub: it is
    // what the entitlements table is keyed by (and what datasets.created_by already holds),
    // so a processor re-deriving entitlements from it resolves the submitter's own rows
    // rather than collapsing to `everyone`. See ADR 0022.
    data.created_by = subjectOf(requestData) ?? null;
    data.isDataAdmin = requestData.token?.isDataAdmin;
    data.isSuperAdmin = requestData.token?.isSuperAdmin;

    const id = await this.boss.send(data.type, data, options ?? {});
    if (!id) {
      throw new ErrorResponse('Failed to create job', StatusCodes.INTERNAL_SERVER_ERROR);
    }
    log.info('Job created', { queue: data.type, job_id: id, created_by: data.created_by ?? null });
    return this.getJobById(requestData, id);
  }

  /**
   * Enqueue-time validation for soil-statistics jobs.
   *
   * The PREVIEW check has to happen here, not only in the processor: this is the one
   * place a raw token exists, so it is the only place external entitlements are visible
   * (getUserEntitlements can only reach them with `token.raw`, which a job processor
   * never has). It also turns "you named a dataset you cannot read" into a synchronous
   * 403 instead of a job that fails minutes later.
   *
   * The filter and label field are checked for the same reason: a bad name should be a
   * 400 on submission, not a failed job.
   *
   * Parameters that the requested statistics_type does not use are rejected rather than
   * ignored, following the same rule as `label_field` without `file_id`: a caller who set
   * histogram_bins: 50 and got no histograms deserves to be told, not left guessing.
   * Rejecting now also keeps the door open — accepting one of these for a future type is
   * an additive change, whereas silently ignoring it now and tightening later is breaking.
   */
  private validateSoilStatisticsJob = async (requestData: RequestData, data: SoilStatisticsJob): Promise<void> => {
    const filterService = new FilterService();

    const statisticsType = data.statistics_type ?? StatisticsType.DESCRIPTIVE;
    if (!Object.values(StatisticsType).includes(statisticsType)) {
      throw new ErrorResponse(
        `Parameter statistics_type '${statisticsType}' is not supported: use one of ${Object.values(StatisticsType).join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    if (statisticsType !== StatisticsType.DESCRIPTIVE) {
      if (data.histogram_bins !== undefined) {
        throw new ErrorResponse(`Parameter histogram_bins does not apply to statistics_type '${statisticsType}'`, StatusCodes.BAD_REQUEST);
      }
      if (data.dataset_ids && data.dataset_ids.length > 0) {
        throw new ErrorResponse(`Parameter dataset_ids does not apply to statistics_type '${statisticsType}'`, StatusCodes.BAD_REQUEST);
      }
    }

    // Throws 404 when the filter does not exist.
    const filter = await filterService.getFilterById(requestData, data.filter_id);

    if (!data.file_id && filter.geometryIds.length === 0) {
      throw new ErrorResponse(
        `Filter '${data.filter_id}' has no geometries: supply a file_id or a filter with an area of interest`,
        StatusCodes.BAD_REQUEST,
      );
    }

    if (data.label_field) {
      if (!data.file_id) {
        throw new ErrorResponse('Parameter label_field requires file_id', StatusCodes.BAD_REQUEST);
      }
      const file = await new FileService().getFile(requestData, data.file_id);
      const metadata = file.metadata;
      if (!metadata || metadata.is_raster) {
        throw new ErrorResponse(`File '${data.file_id}' has no vector metadata to take label_field from`, StatusCodes.BAD_REQUEST);
      }
      if (!metadata.field_names.includes(data.label_field)) {
        throw new ErrorResponse(`File '${data.file_id}' has no field named '${data.label_field}'`, StatusCodes.BAD_REQUEST);
      }
    }

    if (data.dataset_ids && data.dataset_ids.length > 0) {
      await entitlementService.enforceEntitlements(requestData, data.dataset_ids, Capability.PREVIEW);
    }
  };

  getJobs = async (requestData: RequestData): Promise<Job[]> => {
    const subject = subjectOf(requestData);
    if (!subject) {
      throw new ErrorResponse('Authentication required to list jobs', StatusCodes.UNAUTHORIZED);
    }
    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();

    // Filter jobs to only include those created by the user. Compared against the Subject
    // because that is what createJob writes; comparing against the raw sub would hide a
    // caller's own jobs from them whenever the token carries an email.
    // j.data === null for CLEANUP_ORPHAN_FILES jobs.
    const userJobs = jobs.map(j => this.translateJob(j)).filter(j => j.data?.created_by === subject);

    log.info('Jobs listed', { count: userJobs.length, user: subject });
    return userJobs.map(job => this.prepareJobForResponse(job));
  };

  getJobById = async (requestData: RequestData, jobId: string): Promise<Job> => {
    const subject = subjectOf(requestData);

    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue, { id: jobId }));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();
    if (jobs.length) {
      // Check ownership
      const job = this.translateJob(jobs[0]!);
      if (job.data.created_by && job.data.created_by !== subject) {
        throw new ErrorResponse('Unauthorized to access this job', StatusCodes.UNAUTHORIZED);
      }
      return this.prepareJobForResponse(job);
    }
    throw new ErrorResponse(`Job '${jobId}' not found`, StatusCodes.NOT_FOUND);
  };

  deleteJobById = async (requestData: RequestData, jobId: string) => {
    const subject = subjectOf(requestData);
    const job = await this.getJobById(requestData, jobId);
    if (subject && job.data.created_by && job.data.created_by !== subject) {
      throw new ErrorResponse('Unauthorized to delete this job', StatusCodes.UNAUTHORIZED);
    }
    log.info('Job cancelled', { job_id: jobId, user: subject ?? null });
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
