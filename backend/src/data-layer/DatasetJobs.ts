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

/** Queues whose running job is a Dataset's `active_job`: bulk-delete is left out, since its Dataset leaves the list. */
export const DATASET_LOAD_QUEUES: string[] = [JobQueues.BULK_LOAD, JobQueues.RASTER_LOAD];

/**
 * Each of the given Datasets' unfinished work, keyed by slug, in one query:
 * - `queued`: its job pg-boss has not picked up yet, on any locking queue (its `queued_job`);
 * - `active`: its running job on one of `activeQueues`, its loads by default (its `active_job`).
 *
 * At most one of each per Dataset: the lock refuses a second. Read from pg-boss rather than from the
 * Dataset's status, which a load no longer changes, so each clears whichever way its job ends:
 * completed, failed, cancelled or reaped.
 */
export async function getUnfinishedJobs(
  entityManager: EntityManager,
  slugs: string[],
  activeQueues: string[] = DATASET_LOAD_QUEUES,
): Promise<{ queued: Map<string, QueuedJob>; active: Map<string, QueuedJob> }> {
  const queued = new Map<string, QueuedJob>();
  const active = new Map<string, QueuedJob>();
  if (slugs.length === 0) {
    return { queued, active };
  }
  const rows: UnfinishedJobRow[] = await entityManager.query(
    `SELECT id, name AS queue, state, data->>'dataset_id' AS dataset_id
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE data->>'dataset_id' = ANY($3)
       AND ((state = 'created' AND name = ANY($1)) OR (state = 'active' AND name = ANY($2)))`,
    [DATASET_LOCKING_QUEUES, activeQueues, slugs],
  );
  for (const { id, queue, state, dataset_id } of rows) {
    (state === 'created' ? queued : active).set(dataset_id, { id, queue });
  }
  return { queued, active };
}

/** The running (`active`) job on one of the given queues for any of the given Datasets, by slug, or null. */
export async function getActiveJob(entityManager: EntityManager, queues: string[], slugs: string[]): Promise<QueuedJob | null> {
  if (slugs.length === 0) {
    return null;
  }
  const [job]: QueuedJob[] = await entityManager.query(
    `SELECT id, name AS queue
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = ANY($1) AND state = 'active' AND data->>'dataset_id' = ANY($2)
     ORDER BY started_on
     LIMIT 1`,
    [queues, slugs],
  );
  return job ?? null;
}

/**
 * Whether a Raster Load of the Dataset would ingest a File: a raster File waiting for a load (PENDING)
 * whose data mapping names at least one band. Other PENDING Files are never loaded: a non-raster
 * File, and a raster File whose mapping is empty, which the loader skips. Shared by the check when
 * the job is created and the loader, so a load that only removes layers is told apart the same way.
 */
export async function hasRasterFileToLoad(entityManager: EntityManager, datasetId: string): Promise<boolean> {
  const [row] = await entityManager.query(
    `SELECT 1
     FROM dataset_file_mappings dfm
     JOIN files f ON f.id = dfm.file_id AND f.deleted_at IS NULL
     JOIN data_mappings dm ON dm.id = dfm.data_mapping_id
     WHERE dfm.dataset_id = $1
       AND dfm.deleted_at IS NULL
       AND f.status = 'PENDING'
       AND (f.metadata->>'is_raster')::boolean
       AND EXISTS (SELECT 1 FROM jsonb_each(dm.data_mapping) band WHERE jsonb_typeof(band.value) = 'object')
     LIMIT 1`,
    [datasetId],
  );
  return !!row;
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
