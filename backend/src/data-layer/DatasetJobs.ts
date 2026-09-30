import { EntityManager } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import { PG_BOSS_SCHEMA } from '../services/PgBoss';
import { JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { QueuedJob } from '../interfaces/Job';

/** Queues whose unfinished jobs lock their Dataset. file-to-db is left out on purpose (docs/adr/0042). */
export const DATASET_LOCKING_QUEUES: string[] = [JobQueues.BULK_LOAD, JobQueues.RASTER_LOAD, JobQueues.BULK_DELETE];

interface UnfinishedJobRow extends QueuedJob {
  state: 'created' | 'active';
  dataset_id: string;
}

/** The Queued job of each of the given Datasets, keyed by slug. At most one each: the lock refuses a second. */
export async function getQueuedJobs(entityManager: EntityManager, slugs: string[]): Promise<Map<string, QueuedJob>> {
  const rows: UnfinishedJobRow[] = await entityManager.query(
    `SELECT id, name AS queue, data->>'dataset_id' AS dataset_id
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = ANY($1) AND state = 'created' AND data->>'dataset_id' = ANY($2)`,
    [DATASET_LOCKING_QUEUES, slugs],
  );
  return new Map(rows.map(({ id, queue, dataset_id }) => [dataset_id, { id, queue }]));
}

/**
 * Refuses with 409 while the Dataset has a job on a locking queue that is Queued or running.
 *
 * The advisory lock makes concurrent submissions and edits on one Dataset check one at a time. It is
 * released when the request commits; pg-boss enqueues through its own connection, so by then the
 * job this request created is already visible to the next one.
 */
export async function assertNoUnfinishedJob(
  entityManager: EntityManager,
  dataset: { id: string; slug: string; name: string },
): Promise<void> {
  await entityManager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`dataset-jobs:${dataset.id}`]);
  const [job]: UnfinishedJobRow[] = await entityManager.query(
    `SELECT id, name AS queue, state
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = ANY($1) AND state IN ('created', 'active') AND data->>'dataset_id' = $2
     ORDER BY created_on
     LIMIT 1`,
    [DATASET_LOCKING_QUEUES, dataset.slug],
  );
  if (job) {
    const state = job.state === 'created' ? 'queued' : 'running';
    throw new ErrorResponse(
      `Dataset '${dataset.name}' has a ${job.queue} job ${state} (${job.id}): try again once it finishes`,
      StatusCodes.CONFLICT,
    );
  }
}
