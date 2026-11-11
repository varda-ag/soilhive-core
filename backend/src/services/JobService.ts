import { createHash } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import {
  AnyJob,
  ExportJob,
  Job,
  DataRequestJob,
  SoilIndexJob,
  RunJobData,
  BulkLoadJob,
  ClassDistributionVariable,
} from '../interfaces/Job';
import { Capability, JobQueues, SoilIndexType, StatisticsType, VariableType } from '../types/enums';
import { getPgBoss } from './PgBoss';
import { JobWithMetadata, SendOptions } from 'pg-boss';
import { createSignedPath } from '../utils/presigned-url';
import EntitlementService from './EntitlementService';
import FilterService from './FilterService';
import FileService from './FileService';
import SoilPropertyService from './SoilPropertyService';
import { DataFilter } from '../interfaces/DatasetFilter';
import { misplacedParameter, notASoilIndexRun, parametersProblem, SAME_CORRELATION_VARIABLES } from '../jobs/data-requests/parameters';
import { soilIndexRunExists } from '../data-layer/SoilIndex';
import { isPrivilegedCaller, subjectOf } from '../utils/auth';
import { log } from '../utils/logger';
import { translateJobError, translateQueueMessage } from '../errors/jobErrorMessages';
import { assertNoUnfinishedJob, DATASET_LOCKING_QUEUES, hasRasterFileToLoad } from '../data-layer/DatasetJobs';
import { assertNotVersioned } from '../data-layer/DatasetVersions';
import { getEntity } from '../utils/slugs';
import { JobError } from '../errors/JobError';
import { checkExportLimitsAtSubmission } from '../jobs/soil-export/submissionCheck';
import { getExportLimits } from '../jobs/soil-export/exportLimits';
import DatasetEntity from '../entities/Dataset';
import { EntityType, IngestionStatus } from '../types/data';

const entitlementService = new EntitlementService();

const UNFINISHED_STATES: string[] = ['created', 'retry', 'active'];

/**
 * What identical Export requests share (docs/adr/0074): every request field, arrays as sets,
 * plus the Subject and the flags that decide its Export Limits.
 */
const exportKey = (data: ExportJob): string => {
  const set = (values: string[] | undefined) => [...new Set(values ?? [])].sort();
  const metadataUrls = data.public_metadata_urls ?? {};
  const identity = [
    data.created_by,
    Boolean(data.isDataAdmin),
    Boolean(data.isSuperAdmin),
    data.filter_id,
    set(data.dataset_ids),
    set(data.formats),
    data.target_crs ?? null,
    data.public_homepage_url ?? null,
    data.public_terms_url ?? null,
    Object.keys(metadataUrls)
      .sort()
      .map(id => [id, metadataUrls[id]]),
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
};

export default class JobService {
  private boss = getPgBoss();

  /** The job enqueued, or the unfinished Export the request joined instead (docs/adr/0074). */
  async createJob(requestData: RequestData, data: AnyJob, options?: SendOptions): Promise<{ job: Job; joined: boolean }> {
    const { sub } = requestData.token ?? {};

    // Checking preconditions
    if (
      data.type === JobQueues.BULK_LOAD ||
      data.type === JobQueues.RASTER_LOAD ||
      data.type === JobQueues.FILE_TO_DB ||
      data.type === JobQueues.BULK_DELETE ||
      data.type === JobQueues.RASTER_FILTER_INSTALL ||
      data.type === JobQueues.VERSION_RESET ||
      data.type === JobQueues.VERSION_DISCARD ||
      data.type === JobQueues.VERSION_PUBLISH
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

    if (DATASET_LOCKING_QUEUES.includes(data.type)) {
      await this.lockDataset(requestData, data as BulkLoadJob);
    }

    // Checking entitlements
    let exportDatasetSlugs: string[] = [];
    if (data.type === JobQueues.EXPORT) {
      await this.checkExportSignIn(requestData);
      // Every named Dataset must exist now: the job reads vector rows under preview alone, so one
      // published after this check would never have download checked (docs/adr/0073)
      exportDatasetSlugs = await entitlementService.enforceDatasetEntitlements(
        requestData,
        (data as ExportJob).dataset_ids,
        Capability.DOWNLOAD,
        { requireAll: true },
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

    if (data.type === JobQueues.EXPORT) {
      // Anonymous Exports carry no key, so they never join
      if (data.created_by) {
        const singletonKey = exportKey(data as ExportJob);
        const joined = await this.findExportToJoin(requestData, singletonKey);
        if (joined) {
          log.info('Job joined', { queue: data.type, job_id: joined.id, created_by: data.created_by });
          return { job: joined, joined: true };
        }
        options = { ...options, singletonKey };
      }
      // After the join: the Export it joins passed this same check
      await this.checkExportLimits(requestData, data as ExportJob, exportDatasetSlugs);
    }

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
    return { job, joined: false };
  }

  /**
   * The unfinished Export with this key, if any. The advisory lock makes identical submissions check one
   * at a time. It is released when the request commits; pg-boss enqueues through its own connection, so
   * by then the job this request created is already visible to the next one.
   */
  private findExportToJoin = async (requestData: RequestData, key: string): Promise<Job | null> => {
    await requestData.entityManager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`export-jobs:${key}`]);
    const jobs = await this.boss.findJobs(JobQueues.EXPORT, { key });
    const unfinished = jobs.find(job => UNFINISHED_STATES.includes(job.state));
    return unfinished ? this.translateJob(unfinished) : null;
  };

  /**
   * Refuses the job while its Dataset has another one Queued or running (docs/adr/0042).
   * dataset_id is rewritten to the current slug: an old one resolves here but would never match
   * the Queued lookup, which compares slugs as stored in the job data.
   */
  private lockDataset = async (
    requestData: RequestData,
    data: { dataset_id: string; type: string; delete_source_files?: boolean },
  ): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, data.dataset_id);
    data.dataset_id = dataset.slug;
    await assertNoUnfinishedJob(requestData.entityManager, dataset);
    if (data.type === JobQueues.BULK_LOAD || data.type === JobQueues.RASTER_LOAD) {
      await this.assertLoadable(requestData, dataset, data.type);
      // Resetting a Version loads its Files again from their uploads; publishing it takes the flag instead
      if (dataset.version_of && data.delete_source_files) {
        throw new ErrorResponse(
          `Dataset '${dataset.name}' is a version, whose uploads are kept until it is published: leave delete_source_files unset`,
          StatusCodes.BAD_REQUEST,
        );
      }
    }
    if (data.type === JobQueues.BULK_DELETE) {
      await assertNotVersioned(requestData.entityManager, dataset);
    }
  };

  /**
   * Refuses a load into a PUBLISHED Dataset with 409: loads no longer hide the Dataset while they
   * run, so its readers would see it half-loaded. Data is added to it through a Version instead
   * (DatasetVersionService). A Raster Load with no File to ingest is let through, since all it does
   * is remove the layers of removed Files (removeUnmappedLayers in RasterLoader).
   */
  private assertLoadable = async (requestData: RequestData, dataset: DatasetEntity, queue: JobQueues): Promise<void> => {
    if (dataset.status !== IngestionStatus.PUBLISHED) {
      return;
    }
    if (queue === JobQueues.RASTER_LOAD && !(await hasRasterFileToLoad(requestData.entityManager, dataset.id))) {
      return;
    }
    throw new ErrorResponse(
      `Dataset '${dataset.name}' is published, so data can't be loaded into it: open a version of it to add data`,
      StatusCodes.CONFLICT,
    );
  };

  /**
   * Refuses an Export from a caller with no token while administrators require a signed-in user
   * to export (docs/adr/0075). Judged before the Dataset checks: signing in may grant the download.
   */
  private checkExportSignIn = async (requestData: RequestData): Promise<void> => {
    if (requestData.token?.sub) return;
    const { exportRequiresSignIn } = await getExportLimits(requestData.entityManager, {});
    if (exportRequiresSignIn) {
      throw new ErrorResponse('Exports require a signed-in user', StatusCodes.UNAUTHORIZED);
    }
  };

  /**
   * Refuses an Export over its limits with the message its job would fail with, so nothing is
   * queued and the caller can change the request (docs/adr/0070).
   */
  private checkExportLimits = async (requestData: RequestData, data: ExportJob, datasetSlugs: string[]): Promise<void> => {
    try {
      await checkExportLimitsAtSubmission(requestData, data, datasetSlugs);
    } catch (error) {
      if (!JobError.isJobError(error)) throw error;
      const { message, actions } = translateJobError(error.code, error.params);
      throw new ErrorResponse([message, ...actions].join(' '), StatusCodes.BAD_REQUEST);
    }
  };

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
      await this.validateVariable(requestData, data.variable, data.filter_id, filter);
    }
    if (data.variable_x && data.variable_y) {
      const x = await this.validateSoilPropertyVariable(requestData, 'variable_x', data.variable_x.id, data.filter_id, filter);
      const y = await this.validateSoilPropertyVariable(requestData, 'variable_y', data.variable_y.id, data.filter_id, filter);
      // An old slug and the current one name the same Soil Property.
      if (x === y) {
        throw new ErrorResponse(SAME_CORRELATION_VARIABLES, StatusCodes.BAD_REQUEST);
      }
    }

    if (data.dataset_ids && data.dataset_ids.length > 0) {
      await entitlementService.enforceDatasetEntitlements(requestData, data.dataset_ids, Capability.PREVIEW);
    }
  };

  private validateVariable = async (
    requestData: RequestData,
    variable: ClassDistributionVariable,
    filterId: string,
    filter: DataFilter,
  ): Promise<void> => {
    const { id, type } = variable;

    // Needs an attached partition. The Filter's criteria other than its sampling dates are ignored (docs/adr/0058).
    if (type === VariableType.SOIL_INDEX) {
      if (!(await soilIndexRunExists(requestData.entityManager, id))) {
        throw new ErrorResponse(notASoilIndexRun(id), StatusCodes.BAD_REQUEST);
      }
      return;
    }

    await this.validateSoilPropertyVariable(requestData, 'variable', id, filterId, filter);
  };

  /** Checks that the Soil Property exists and that the Filter admits it. Returns its current slug. */
  private validateSoilPropertyVariable = async (
    requestData: RequestData,
    name: string,
    id: string,
    filterId: string,
    filter: DataFilter,
  ): Promise<string> => {
    let slug: string;
    try {
      ({ slug } = await new SoilPropertyService().getSoilProperty(requestData, id));
    } catch {
      throw new ErrorResponse(`Parameter ${name}.id '${id}' is not a soil property`, StatusCodes.BAD_REQUEST);
    }

    const admitted = filter.parameters.soil_properties;
    if (admitted && admitted.length > 0 && !admitted.includes(slug)) {
      throw new ErrorResponse(
        `Soil property '${id}' is excluded by filter '${filterId}', which admits only: ${admitted.join(', ')}`,
        StatusCodes.BAD_REQUEST,
      );
    }
    return slug;
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
      const file = await new FileService().getUnmappedFile(requestData, data.file_id);
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
   * rules contradict these (docs/adr/0037, 0044).
   */
  private static readonly QUEUES_NOT_SERVED: string[] = [JobQueues.DATA_REQUESTS, JobQueues.SOIL_INDEXES];

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
