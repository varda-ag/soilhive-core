import { PgBoss, Job } from 'pg-boss';
import { getDBPassword, getSSL } from '../utils/db-credentials';
import { BulkLoadJob } from '../interfaces/Job';
import BulkLoader from '../data-layer/BulkLoader';
import { JobQueues } from '../types/enums';

let globalBoss: PgBoss | null = null;
let globalInitialized = false;

export const PG_BOSS_SCHEMA = `${process.env.POSTGRES_SCHEMA!}_pgboss`;

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
  await boss.createQueue(JobQueues.BULK_LOAD, options);
  await boss.createQueue(JobQueues.EXPORT, options);
};

const setupWorkers = async () => {
  const options = {
    localConcurrency: 1,
    groupConcurrency: 5,
  };
  const boss = getPgBoss();
  await boss.work<BulkLoadJob>(JobQueues.BULK_LOAD, options, async ([job]: Job<BulkLoadJob>[]) => {
    if (!job) {
      return;
    }
    const worker = new BulkLoader();
    worker.startBulkLoad(job.data);
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
