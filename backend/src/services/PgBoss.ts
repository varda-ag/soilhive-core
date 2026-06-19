import { PgBoss, Job } from 'pg-boss';
import { getDBPassword, getSSL } from '../utils/db-credentials';
import { BulkLoadJob, ExportJob, FileToDbJob, BulkDeleteJob } from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import { getJobGroupConcurrency, getJobLocalConcurrency, isJest, setupEnv } from '../utils/utils';
import { processExportJob } from '../jobs/soil-export/soilExportJob';
import { processFileToDb } from '../jobs/file-to-db/FileToDbJob';
import { processBulkLoad } from '../jobs/bulk-load/BulkLoader';
import { processBulkDeletion } from '../jobs/bulk-delete/BulkDeleter';
import { processOrphanCleanup } from '../jobs/orphan-cleanup/OrphanCleanupJob';
import { log } from '../utils/logger';
import { JobError } from '../errors/JobError';
import { getEntityManager } from '../utils/data-source';

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
  globalBoss.on('error', err => log.error('pg-boss internal error', { error: err.message, stack: err.stack }));
  return globalBoss;
};

const startPgBoss = async () => {
  const boss = getPgBoss();
  await boss.start();
  log.info('PgBoss started');
};

const setupQueues = async () => {
  const options = {
    retryLimit: 0, // Zero retries
    expireInSeconds: 60 * 60 * 24 - 1, // 24 hours (minus one according to pg-boss policy)
  };
  const boss = getPgBoss();
  const promises = Object.values(JobQueues).map(async queue => await boss.createQueue(queue, options));
  await Promise.all(promises);
  log.info('PgBoss queues created', { queues: Object.values(JobQueues) });
};

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
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (JobError.isJobError(error)) {
      try {
        const entityManager = await getEntityManager();
        await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET data = data || $1::jsonb WHERE id = $2`, [
          JSON.stringify({ errors: [{ code: error.code, params: error.params }] }),
          job.id,
        ]);
      } catch (writeErr) {
        log.error('Failed to write JobError to pg-boss data', {
          job_id: job.id,
          error: writeErr instanceof Error ? writeErr.message : String(writeErr),
        });
      }
    }
    throw error;
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
  await boss.work<BulkLoadJob>(JobQueues.BULK_LOAD, options, async (jobs: Job<BulkLoadJob>[]) => {
    for (const job of jobs) {
      await runJob(JobQueues.BULK_LOAD, job, processBulkLoad);
    }
  });
  await boss.work<ExportJob>(JobQueues.EXPORT, options, async (jobs: Job<ExportJob>[]) => {
    for (const job of jobs) {
      await runJob(JobQueues.EXPORT, job, processExportJob);
    }
  });
  await boss.work<FileToDbJob>(JobQueues.FILE_TO_DB, options, async (jobs: Job<FileToDbJob>[]) => {
    for (const job of jobs) {
      await runJob(JobQueues.FILE_TO_DB, job, processFileToDb);
    }
  });
  await boss.work<BulkDeleteJob>(JobQueues.BULK_DELETE, options, async (jobs: Job<BulkDeleteJob>[]) => {
    for (const job of jobs) {
      await runJob(JobQueues.BULK_DELETE, job, processBulkDeletion);
    }
  });
  await boss.work(JobQueues.CLEANUP_ORPHAN_FILES, options, async (jobs: Job<object>[]) => {
    for (const job of jobs) {
      await runJob(JobQueues.CLEANUP_ORPHAN_FILES, job, processOrphanCleanup);
    }
  });
  log.info('PgBoss workers registered', { queues: Object.values(JobQueues) });
};

const setupSchedules = async () => {
  const boss = getPgBoss();
  await boss.schedule(JobQueues.CLEANUP_ORPHAN_FILES, '0 0 * * *');
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

export const stopPgBoss = async () => {
  if (!globalInitialized) {
    return;
  }
  globalInitialized = false;
  const boss = getPgBoss();
  await boss.stop();
};
