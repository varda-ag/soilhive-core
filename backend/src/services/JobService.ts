import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { AnyJob, ExportJob, Job, DataRequestJob, SoilIndexJob, RunJobData } from '../interfaces/Job';
import { Capability, JobQueues, SoilIndexType, StatisticsType, VariableType } from '../types/enums';
import { EntitlementScope } from '../types/Entitlements';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata, SendOptions } from 'pg-boss';
import { createSignedPath } from '../utils/presigned-url';
import EntitlementService from './EntitlementService';
import FilterService from './FilterService';
import FileService from './FileService';
import SoilPropertyService from './SoilPropertyService';
import { DataFilter } from '../interfaces/DatasetFilter';
import { misplacedParameter, notASoilIndexRun, parametersProblem, soilIndexFilterProblem } from '../jobs/data-requests/parameters';
import { soilIndexRunExists } from '../data-layer/SoilIndex';
import { getSubject, isPrivilegedCaller } from '../utils/auth';
import { log } from '../utils/logger';
import { translateJobError, translateQueueMessage } from '../errors/jobErrorMessages';

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
      if (!isPrivilegedCaller(requestData.token)) {
        throw new ErrorResponse(`${data.type} jobs require the data-admin or super-admin scope`, StatusCodes.FORBIDDEN);
      }
    }

    // Checking entitlements
    if (data.type === JobQueues.EXPORT) {
      await entitlementService.enforceEntitlements(
        requestData,
        EntitlementScope.DATASETS,
        (data as ExportJob).dataset_ids,
        Capability.DOWNLOAD,
      );
    }

    if (data.type === JobQueues.DATA_REQUESTS) {
      await this.validateDataRequestJob(requestData, data as DataRequestJob);
    }

    if (data.type === JobQueues.SOIL_INDEXES) {
      await this.validateSoilIndexJob(requestData, data as SoilIndexJob);
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

    // Read back by queue rather than through getJobById: a `data-requests` job is enqueued here
    // by DataRequestService, and `/jobs/{jobId}` deliberately does not serve that queue.
    const job = await this.findJobInQueue(data.type as JobQueues, id);
    if (!job) {
      throw new ErrorResponse('Failed to create job', StatusCodes.INTERNAL_SERVER_ERROR);
    }
    return job;
  }

  /**
   * Enqueue-time validation for data-requests jobs.
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
   * value_type: 'count' on a descriptive request deserves to be told, not left guessing.
   * Rejecting now also keeps the door open - accepting one of these for a future type is
   * an additive change, whereas silently ignoring it now and tightening later is breaking.
   */
  private validateDataRequestJob = async (requestData: RequestData, data: DataRequestJob): Promise<void> => {
    const statisticsType = data.statistics_type;
    if (!statisticsType) {
      throw new ErrorResponse(
        `Parameter statistics_type is required: use one of ${Object.values(StatisticsType).join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    if (!Object.values(StatisticsType).includes(statisticsType)) {
      throw new ErrorResponse(
        `Parameter statistics_type '${statisticsType}' is not supported: use one of ${Object.values(StatisticsType).join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    const misplaced = misplacedParameter(data, statisticsType);
    if (misplaced) {
      throw new ErrorResponse(`Parameter ${misplaced} does not apply to statistics_type '${statisticsType}'`, StatusCodes.BAD_REQUEST);
    }
    const problem = parametersProblem(data);
    if (problem) {
      throw new ErrorResponse(problem, StatusCodes.BAD_REQUEST);
    }

    const filter = await this.validateRunJob(requestData, data);

    if (data.variable) {
      await this.validateVariable(requestData, data, filter);
    }

    if (data.dataset_ids && data.dataset_ids.length > 0) {
      await entitlementService.enforceEntitlements(requestData, EntitlementScope.DATASETS, data.dataset_ids, Capability.PREVIEW);
    }
  };

  private validateVariable = async (requestData: RequestData, data: DataRequestJob, filter: DataFilter): Promise<void> => {
    const { id, type } = data.variable!;

    // Needs an attached partition and a criteria-free Filter (docs/adr/0039).
    if (type === VariableType.SOIL_INDEX) {
      if (!(await soilIndexRunExists(requestData.entityManager, id))) {
        throw new ErrorResponse(notASoilIndexRun(id), StatusCodes.BAD_REQUEST);
      }
      const problem = soilIndexFilterProblem(data.filter_id, filter.parameters);
      if (problem) {
        throw new ErrorResponse(problem, StatusCodes.BAD_REQUEST);
      }
      return;
    }

    let slug: string;
    try {
      ({ slug } = await new SoilPropertyService().getSoilProperty(requestData, id));
    } catch {
      throw new ErrorResponse(`Parameter variable.id '${id}' is not a soil property`, StatusCodes.BAD_REQUEST);
    }

    const admitted = filter.parameters.soil_properties;
    if (admitted && admitted.length > 0 && !admitted.includes(slug)) {
      throw new ErrorResponse(
        `Soil property '${id}' is excluded by filter '${data.filter_id}', which admits only: ${admitted.join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
  };

  /**
   * Enqueue-time validation for soil-indexes jobs: `soil_index_type` is required
   */
  private validateSoilIndexJob = async (requestData: RequestData, data: SoilIndexJob): Promise<void> => {
    if (!data.soil_index_type) {
      throw new ErrorResponse(
        `Parameter soil_index_type is required: use one of ${Object.values(SoilIndexType).join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    if (!Object.values(SoilIndexType).includes(data.soil_index_type)) {
      throw new ErrorResponse(
        `Parameter soil_index_type '${data.soil_index_type}' is not supported: use one of ${Object.values(SoilIndexType).join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }

    await this.validateRunJob(requestData, data);
  };

  /** The spatial scope every Run takes, checked identically whichever queue will compute it. */
  private validateRunJob = async (requestData: RequestData, data: RunJobData): Promise<DataFilter> => {
    const filterService = new FilterService();

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

    return filter;
  };

  /**
   * Queues not served by `/jobs` or `/jobs/{jobId}`: their jobs have their own endpoints, whose
   * rules contradict these (docs/adr/0037).
   */
  private static readonly QUEUES_NOT_SERVED: string[] = [JobQueues.DATA_REQUESTS];

  getJobs = async (requestData: RequestData): Promise<Job[]> => {
    const subject = subjectOf(requestData);
    if (!subject) {
      throw new ErrorResponse('Authentication required to list jobs', StatusCodes.UNAUTHORIZED);
    }
    const promises = Object.values(JobQueues)
      .filter(queue => !JobService.QUEUES_NOT_SERVED.includes(queue))
      .map(async queue => await this.boss.findJobs(queue));
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

  /**
   * One job by id, as `/jobs/{jobId}` sees it: owned by the caller, and on a queue served by this API.
   */
  getJobById = async (requestData: RequestData, jobId: string): Promise<Job> => {
    const subject = subjectOf(requestData);

    const promises = Object.values(JobQueues).map(async queue => await this.boss.findJobs(queue, { id: jobId }));
    const results = await Promise.all(promises);
    const jobs: JobWithMetadata<unknown>[] = results.flat();
    if (jobs.length) {
      const job = this.translateJob(jobs[0]!);
      if (JobService.QUEUES_NOT_SERVED.includes(job.queue)) {
        throw new ErrorResponse(`Job '${jobId}' not found`, StatusCodes.NOT_FOUND);
      }
      // Check ownership
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

  findJobInQueue = async (queue: JobQueues, jobId: string): Promise<Job | null> => {
    const jobs = await this.boss.findJobs(queue, { id: jobId });
    return jobs.length ? this.translateJob(jobs[0]!) : null;
  };

  /** Jobs on a named queue whose data contains `data` (jsonb containment). No ownership check. */
  findJobsInQueueByData = async (queue: JobQueues, data: object): Promise<Job[]> => {
    const jobs = await this.boss.findJobs(queue, { data });
    return jobs.map(job => this.translateJob(job));
  };

  /** Cancels a job on a named queue. No ownership check, for the same reason as findJobInQueue. */
  cancelJobInQueue = async (queue: JobQueues, jobId: string | string[]): Promise<void> => {
    await this.boss.cancel(queue, jobId);
  };

  /**
   * Removes a job row
   */
  deleteJobInQueue = async (queue: JobQueues, jobId: string | string[]): Promise<void> => {
    await this.boss.deleteJob(queue, jobId);
  };

  /**
   * A failure can reach here three different ways, and `message` has to be readable from all of
   * them - for an Export it is the *only* channel, since ErrorService.getDatasetErrors covers the
   * dataset-scoped queues and an Export has no dataset_id to be found by.
   * That is also why a JobError's `actions` are folded into `message`.
   *
   *   1. A JobError recorded by runJob into `data.errors`. Its raw Error message is only the code
   *      ("JobError: EX_XLSX_TOO_MANY_RECORDS"), so it is translated here rather than shown.
   *   2. Any other thrown error, whose Error pg-boss serialises directly onto `output`.
   *   3. A monitor reap. `failJobsByTimeout` and `failJobsByHeartbeat` run as literal SQL on
   *      whichever node holds the maintenance lock - none of our code runs, nothing lands in
   *      `data.errors`, and their output nests the message under `value` rather than at the top
   *      level, carrying a raw queue-library string.
   *
   * All three are resolved to display-ready copy here so no client has to know any of it.
   */
  private translateJob = (job: JobWithMetadata<unknown>): Job => {
    // Only a failed job has a failure to describe
    const failed = job.state === 'failed';
    const output = failed ? (job.output as Record<string, any> | null | undefined) : undefined;
    const jobError = failed
      ? (job.data as { errors?: Array<{ code: string; params?: Record<string, unknown> }> } | null)?.errors?.[0]
      : undefined;
    const raw = output?.['message'] ?? output?.['value']?.['message'];
    const translated = jobError ? translateJobError(jobError.code, jobError.params ?? {}) : undefined;
    const message = translated
      ? [translated.message, ...translated.actions].join(' ')
      : typeof raw === 'string'
        ? translateQueueMessage(raw)
        : raw;
    return {
      id: job.id,
      queue: job.name,
      status: job.state,
      created_at: job.createdOn,
      completed_at: job.completedOn,
      data: job.data as AnyJob,
      message,
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
