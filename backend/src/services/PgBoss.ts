import { PgBoss, Job, JobResult, JobWithMetadata, StopOptions } from 'pg-boss';
import { getDBPassword, getSSL } from '../utils/db-credentials';
import {
  BulkLoadJob,
  ExportJob,
  FileToDbJob,
  BulkDeleteJob,
  RefreshDaiStatsJob,
  RasterLoadJob,
  DataRequestJob,
  SoilIndexJob,
  SoilIndexTilesJob,
  RasterFilterInstallJob,
  VersionResetJob,
  VersionDiscardJob,
  VersionPublishJob,
} from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import {
  getDataRequestsConcurrency,
  getJobGroupConcurrency,
  getJobLocalConcurrency,
  getSoilIndexesConcurrency,
  isJest,
  setupEnv,
} from '../utils/utils';
import { processExportJob } from '../jobs/soil-export/soilExportJob';
import { processFileToDb } from '../jobs/file-to-db/FileToDbJob';
import { processBulkLoad } from '../jobs/bulk-load/BulkLoader';
import { processRasterLoad } from '../jobs/raster-load/RasterLoader';
import { processBulkDeletion } from '../jobs/bulk-delete/BulkDeleter';
import { processOrphanCleanup } from '../jobs/orphan-cleanup/OrphanCleanupJob';
import { processSweepOrphanRows } from '../jobs/orphan-cleanup/SweepOrphanRowsJob';
import { processVersionDiscard, processVersionReset } from '../jobs/version/VersionJobs';
import { processVersionPublish } from '../jobs/version/VersionPublishJob';
import { log } from '../utils/logger';
import { JobError } from '../errors/JobError';
import { INTERRUPTION_MESSAGES, outputMessage, UNEXPECTED_JOB_ERROR_CODE } from '../errors/jobErrorMessages';
import { getEntityManager } from '../utils/data-source';
import { getErrorMessage } from '../utils/error';
import { bumpCacheEpoch } from '../utils/cache-epoch';
import { refreshDaiStats } from '../data-layer/DaiStats';
import { processRefreshDaiStats } from '../jobs/refresh-dai-stats/RefreshDaiStatsJob';
import { processDataRequest } from '../jobs/data-requests/DataRequestJob';
import { processSoilIndex } from '../jobs/soil-indexes/SoilIndexJob';
import { processSoilIndexTiles } from '../jobs/soil-index-tiles/SoilIndexTilesJob';
import { processRasterFilterInstall } from '../jobs/raster-filter-install/RasterFilterInstaller';
import { getEntity } from '../utils/slugs';
import DatasetEntity from '../entities/Dataset';
import { EntityType } from '../types/data';

setupEnv();

export const PG_BOSS_SCHEMA = `${process.env.POSTGRES_SCHEMA!}_pgboss`;

let globalBoss: PgBoss | null = null;
let globalInitialized = false;

export const getPgBoss = () => {
  if (globalBoss) {
    return globalBoss;
  }
  globalBoss = new PgBoss({
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: getDBPassword,
    ...(process.env.POSTGRES_PASSWORD ? {} : { ssl: getSSL() }),
    database: process.env.POSTGRES_DB!,
    schema: `${PG_BOSS_SCHEMA}`,
    ...(isJest() ? { __test__enableSpies: true } : {}),
  });
  globalBoss.on('error', err => log.error('pg-boss internal error', { error: getErrorMessage(err), stack: err.stack }));
  return globalBoss;
};

const startPgBoss = async () => {
  const boss = getPgBoss();
  await boss.start();
  log.info('PgBoss started');
};

const setupQueues = async () => {
  const options = {
    // Up to two retries, a minute apart, for an Interruption only: runAttempt makes every other failure final (docs/adr/0079)
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: false,
    expireInSeconds: 60 * 60 * 24 - 1, // 24 hours (minus one according to pg-boss policy)
    retentionSeconds: 60 * 60 * 24 * 30, // 30 days - retain failed jobs for error surfacing
    // How long a job may go without its worker checking in before the monitor fails it.
    // Without this a worker that dies (OOM kill, node eviction) leaves its job in `active` until `expireInSeconds` (24h) elapses
    heartbeatSeconds: 300,
  };
  const boss = getPgBoss();
  await Promise.all(Object.values(JobQueues).map(queue => boss.createQueue(queue, options)));
  await Promise.all(Object.values(JobQueues).map(queue => boss.updateQueue(queue, options)));
  log.info('PgBoss queues created', { queues: Object.values(JobQueues) });
};

// Queues whose jobs mutate soil data - or derived tables that cached queries
// read, like feature_dai_stats - and must invalidate the query cache on every
// node (see docs/adr/0008). Bumped in `finally`: a failed bulk job may still
// have committed partial batches. For REFRESH_DAI_STATS the enqueue-time bump
// in DatasetService happens before the stats change; this one invalidates
// whatever was cached against the old rollup while the job was pending.
// RASTER_LOAD is included because filterRaster caches the query.
// It needs no DAI refresh, though: raster datasets are excluded from DAI scoring.
// RASTER_FILTER_INSTALL is included because a deleted Raster Filter's id can be installed again,
// and a cached mask query names the table, not what it holds.
// VERSION_RESET and VERSION_DISCARD remove a Version's rows, which a Privileged caller can read.
// VERSION_PUBLISH moves them into a published Dataset, which everyone reads.
const DATA_MUTATING_QUEUES: JobQueues[] = [
  JobQueues.BULK_LOAD,
  JobQueues.RASTER_LOAD,
  JobQueues.BULK_DELETE,
  JobQueues.REFRESH_DAI_STATS,
  JobQueues.RASTER_FILTER_INSTALL,
  JobQueues.VERSION_RESET,
  JobQueues.VERSION_DISCARD,
  JobQueues.VERSION_PUBLISH,
];

export const runJob = async <T>(queue: JobQueues, job: Job<T>, processor: (job: Job<T>) => Promise<void>): Promise<void> => {
  const start = Date.now();
  log.info('Job started', { queue, job_id: job.id });
  try {
    await processor(job);
    log.info('Job completed', { queue, job_id: job.id, duration_ms: Date.now() - start });
  } catch (error) {
    log.error('Job failed', {
      queue,
      job_id: job.id,
      duration_ms: Date.now() - start,
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Every failure is recorded. A JobError carries a translatable code.
    // Anything else - a check-constraint violation, a statement timeout - is
    // recorded under UNEXPECTED_JOB_ERROR_CODE with its raw message as the detail.
    // Written while the job is still active, so it lands before pg-boss moves the row to `failed`;
    // failJobs copies `data` across unchanged, so the entry survives the transition.
    try {
      const entityManager = await getEntityManager();
      const item = JobError.isJobError(error)
        ? { code: error.code, params: error.params, detail: error.detail }
        : { code: UNEXPECTED_JOB_ERROR_CODE, params: {}, detail: getErrorMessage(error) };
      await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET data = data || $1::jsonb WHERE id = $2`, [
        JSON.stringify({ errors: [item] }),
        job.id,
      ]);
    } catch (writeErr) {
      log.error('Failed to write job error to pg-boss data', {
        job_id: job.id,
        error: getErrorMessage(writeErr),
      });
    }
    throw error;
  } finally {
    if (DATA_MUTATING_QUEUES.includes(queue)) {
      await bumpCacheEpoch();
    }
    // Same rationale as the epoch bump: a failed bulk load may have committed
    // partial batches, so the DAI rollup is refreshed regardless of outcome.
    // BULK_DELETE needs no hook here - it soft-deletes the dataset first via
    // DatasetService.deleteDataset with syncDaiRefresh, which refreshes while
    // dataset_layers rows still exist (see refreshDaiStats). Must never fail
    // the job result.
    if (queue === JobQueues.BULK_LOAD) {
      // dataset_id is actually a slug, but we need the UUID to refresh DAI stats
      const slug = (job.data as unknown as BulkLoadJob).dataset_id;
      try {
        const entityManager = await getEntityManager();
        const entity = await getEntity({ entityManager, entitlements: {} }, DatasetEntity, EntityType.DATASET, slug);
        await refreshDaiStats(entityManager, [entity.id]);
      } catch (error) {
        log.warn('Failed to refresh DAI stats after bulk load', { slug, error: getErrorMessage(error) });
      }
    }
  }
};

// Fields of a previous Attempt that would mislead while this one runs: its progress, and an error
// recorded just before it was cut short
const PREVIOUS_ATTEMPT_KEYS = ['progress_percentage', 'progress_description', 'errors'];

/**
 * One Attempt of a job (docs/adr/0079). Anything the job throws is final (`deadletter`), so only an
 * Interruption, which pg-boss records without running our code, leaves a retry. A later Attempt runs
 * only if the one before it was interrupted: an expiry timeout is retried by pg-boss too, and ends here.
 */
export const runAttempt = async <T>(
  queue: JobQueues,
  job: JobWithMetadata<T>,
  processor: (job: Job<T>) => Promise<void>,
): Promise<JobResult> => {
  if (job.retryCount > 0) {
    const previous = outputMessage(job.output);
    if (!previous || !INTERRUPTION_MESSAGES.includes(previous)) {
      log.warn('Job not retried: its previous attempt was not interrupted', { queue, job_id: job.id, previous });
      return { id: job.id, status: 'deadletter', output: job.output };
    }
    log.info('Job retried after an interruption', { queue, job_id: job.id, attempt: job.retryCount + 1, previous });
    try {
      await getPgBoss()
        .getDb()
        .executeSql(`UPDATE ${PG_BOSS_SCHEMA}.job SET data = data - $1::text[] WHERE id = $2 AND state = 'active'`, [
          PREVIOUS_ATTEMPT_KEYS,
          job.id,
        ]);
    } catch (error) {
      log.warn('Failed to clear the previous attempt', { job_id: job.id, error: getErrorMessage(error) });
    }
  }
  try {
    await runJob(queue, job, processor);
    return { id: job.id, status: 'completed' };
  } catch (error) {
    return { id: job.id, status: 'deadletter', output: error };
  }
};

const setupWorkers = async () => {
  const options = {
    // Number of workers to spawn for each queue (per-node).
    // Each worker polls and processes jobs independently.
    localConcurrency: getJobLocalConcurrency(),
    // Limit concurrent jobs per group globally across all nodes (database tracking).
    // Coordinates across distributed deployments via database queries.
    groupConcurrency: getJobGroupConcurrency(),
  };
  const boss = getPgBoss();
  // Each job settles through runAttempt's result, which needs the retry count and previous output.
  // Processors are passed as `job => processX(job)`, never `processX`: the arrow reads the import when a job runs,
  // so a test's jest.spyOn on the module, made after the workers registered, still takes effect.
  const work = async <T>(queue: JobQueues, queueOptions: typeof options, processor: (job: Job<T>) => Promise<void>) => {
    const workOptions = { ...queueOptions, perJobResults: true as const, includeMetadata: true as const };
    return boss.work<T, JobResult[], typeof workOptions>(queue, workOptions, async jobs => {
      const results: JobResult[] = [];
      for (const job of jobs) {
        results.push(await runAttempt(queue, job, processor));
      }
      return results;
    });
  };
  await work<BulkLoadJob>(JobQueues.BULK_LOAD, options, job => processBulkLoad(job));
  // Raster ingest is GDAL-, disk- and memory-heavy, so only one raster load runs
  // at a time. Note this is a per-node cap: with several backend nodes, each one
  // may run its own raster load concurrently.
  await work<RasterLoadJob>(JobQueues.RASTER_LOAD, { ...options, localConcurrency: 1 }, job => processRasterLoad(job));
  await work<ExportJob>(JobQueues.EXPORT, options, job => processExportJob(job));
  await work<FileToDbJob>(JobQueues.FILE_TO_DB, options, job => processFileToDb(job));
  await work<BulkDeleteJob>(JobQueues.BULK_DELETE, options, job => processBulkDeletion(job));
  await work<object>(JobQueues.CLEANUP_ORPHAN_FILES, options, () => processOrphanCleanup());
  await work<RefreshDaiStatsJob>(JobQueues.REFRESH_DAI_STATS, options, job => processRefreshDaiStats(job));
  // Each run holds two staging tables and sorts them with work_mem for the percentile aggregates,
  // so concurrent runs multiply that. This is therefore a memory setting as much as a throughput
  // one and must be read together with getDataRequestsWorkMem, which comes down as this goes up
  // (ADR 0036). Same per-node caveat as RASTER_LOAD - several nodes each run this many.
  await work<DataRequestJob>(JobQueues.DATA_REQUESTS, { ...options, localConcurrency: getDataRequestsConcurrency() }, job =>
    processDataRequest(job),
  );
  // Soil Indexes are on their own queue precisely because one Run of them is long: at one per node
  // a slow index Run can no longer starve the short Data Requests that used to queue behind it.
  await work<SoilIndexJob>(JobQueues.SOIL_INDEXES, { ...options, localConcurrency: getSoilIndexesConcurrency() }, job =>
    processSoilIndex(job),
  );
  // One Run's tiles at a time per node: pre-rendering is a background optimisation and must not
  // compete with the tile requests it exists to spare.
  await work<SoilIndexTilesJob>(JobQueues.SOIL_INDEX_TILES, { ...options, localConcurrency: 1 }, job => processSoilIndexTiles(job));
  // GDAL-, disk- and memory-heavy like RASTER_LOAD, with the same per-node caveat. The two queues
  // are capped separately, so one node may run a raster load and a filter install at once.
  await work<RasterFilterInstallJob>(JobQueues.RASTER_FILTER_INSTALL, { ...options, localConcurrency: 1 }, job =>
    processRasterFilterInstall(job),
  );
  await work<VersionResetJob>(JobQueues.VERSION_RESET, options, job => processVersionReset(job));
  await work<VersionDiscardJob>(JobQueues.VERSION_DISCARD, options, job => processVersionDiscard(job));
  await work<VersionPublishJob>(JobQueues.VERSION_PUBLISH, options, job => processVersionPublish(job));
  // One sweep at a time per node: it only frees space, and SKIP LOCKED already keeps nodes apart
  await work<object>(JobQueues.SWEEP_ORPHAN_ROWS, { ...options, localConcurrency: 1 }, () => processSweepOrphanRows());
  log.info('PgBoss workers registered', { queues: Object.values(JobQueues) });
};

const setupSchedules = async () => {
  const boss = getPgBoss();
  await boss.schedule(JobQueues.CLEANUP_ORPHAN_FILES, '0 0 * * *');
  await boss.schedule(JobQueues.SWEEP_ORPHAN_ROWS, '0 1 * * *');
  log.info('PgBoss schedules registered');
};

export const initPgBoss = async () => {
  if (globalInitialized) {
    return;
  }
  globalInitialized = true;
  await startPgBoss();
  await setupQueues();
  await setupWorkers();
  await setupSchedules();
};

export const stopPgBoss = async (options?: StopOptions) => {
  if (!globalInitialized) {
    return;
  }
  globalInitialized = false;
  const boss = getPgBoss();
  await boss.stop(options);
};

/**
 * When a job was enqueued.
 */
export async function getJobCreatedOn(jobId: string): Promise<Date> {
  try {
    const result = await getPgBoss().getDb().executeSql(`SELECT created_on FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
    const createdOn = result.rows[0]?.created_on;
    if (createdOn) {
      return new Date(createdOn);
    }
    log.warn('Job row not found when reading created_on', { job_id: jobId });
  } catch (error) {
    log.warn('Failed to read job created_on', { job_id: jobId, error: getErrorMessage(error) });
  }
  return new Date();
}

export async function updateJobState(jobId: string, update: Partial<ExportJob>): Promise<void> {
  const boss = getPgBoss();
  const db = boss.getDb();
  await db.executeSql(`UPDATE ${PG_BOSS_SCHEMA}.job SET data = data || $1::jsonb WHERE id = $2 AND state = 'active'`, [
    JSON.stringify(update),
    jobId,
  ]);
}

// Progress is telemetry: a failed write must never abort a load that is otherwise fine.
export const progressReporter =
  (jobId: string) =>
  async (progress_percentage: number, progress_description: string): Promise<void> => {
    try {
      await updateJobState(jobId, { progress_percentage, progress_description });
    } catch (error) {
      log.warn('Failed to write bulk load progress', { job_id: jobId, error: getErrorMessage(error) });
    }
  };
