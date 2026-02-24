import { PgBoss, Job } from 'pg-boss';
import { getDBPassword, getSSL } from '../utils/db-credentials';
import { BulkLoadJob, ExportJob, FileToDbJob } from '../interfaces/Job';
import { JobQueues } from '../types/enums';
import { isJest, setupEnv } from '../utils/utils';
import { processExportJob } from '../jobs/soil-export/soilExportJob';
import { processFileToDb } from '../jobs/file-to-db/FileToDbJob';
import { processBulkLoad } from '../jobs/bulk-load/BulkLoader';

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
  globalBoss.on('error', err => console.error('pg-boss error:', err));
  return globalBoss;
};

const startPgBoss = async () => {
  const boss = getPgBoss();
  await boss.start();
};

const setupQueues = async () => {
  const options = {
    retryLimit: 0, // Zero retries
    expireInSeconds: 60 * 60 * 24 - 1, // 24 hours (minus one according to pg-boss policy)
  };
  const boss = getPgBoss();
  const promises = Object.values(JobQueues).map(async queue => await boss.createQueue(queue, options));
  await Promise.all(promises);
};

const setupWorkers = async () => {
  const options = {
    localConcurrency: 1,
    groupConcurrency: 5,
  };
  const boss = getPgBoss();
  await boss.work<BulkLoadJob>(JobQueues.BULK_LOAD, options, async (jobs: Job<BulkLoadJob>[]) => {
    for (const job of jobs) {
      await processBulkLoad(job);
    }
  });
  await boss.work<ExportJob>(JobQueues.EXPORT, options, async (jobs: Job<ExportJob>[]) => {
    for (const job of jobs) {
      await processExportJob(job);
    }
  });
  await boss.work<FileToDbJob>(JobQueues.FILE_TO_DB, options, async (jobs: Job<FileToDbJob>[]) => {
    for (const job of jobs) {
      await processFileToDb(job);
    }
  });
};

export const initPgBoss = async () => {
  if (globalInitialized) {
    return;
  }
  globalInitialized = true;
  await startPgBoss();
  await setupQueues();
  await setupWorkers();
};

export const stopPgBoss = async () => {
  if (!globalInitialized) {
    return;
  }
  globalInitialized = false;
  const boss = getPgBoss();
  await boss.stop();
};
