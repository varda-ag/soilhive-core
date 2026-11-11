import { EntityManager } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import { PG_BOSS_SCHEMA } from '../services/PgBoss';
import { JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { QueuedJob } from '../interfaces/Job';

/** Queues whose unfinished jobs lock their Dataset. file-to-db is left out on purpose (docs/adr/0042). */
export const DATASET_LOCKING_QUEUES: string[] = [
  JobQueues.BULK_LOAD,
  JobQueues.RASTER_LOAD,
  JobQueues.BULK_DELETE,
  JobQueues.VERSION_RESET,
  JobQueues.VERSION_DISCARD,
  // Locks the Dataset it publishes into by dataset_id, and the Version by version_id (assertNoUnfinishedJob)
  JobQueues.VERSION_PUBLISH,
];

interface UnfinishedJobRow extends QueuedJob {
  state: 'created' | 'retry' | 'active';
  dataset_id: string;
}

/**
 * Queues whose Queued job is a Dataset's `queued_job`: every locking queue but version-publish. A
 * publish locks the Dataset it publishes into, but it's the Version's work, shown on the Version as
 * `pending_version.publishing`: the Dataset itself isn't queued, and keeps showing PUBLISHED.
 */
export const QUEUED_JOB_QUEUES: string[] = DATASET_LOCKING_QUEUES.filter(queue => queue !== JobQueues.VERSION_PUBLISH);

/** Queues whose running job is a Dataset's `active_job`: bulk-delete is left out, since its Dataset leaves the list. */
export const DATASET_LOAD_QUEUES: string[] = [JobQueues.BULK_LOAD, JobQueues.RASTER_LOAD];

/**
 * Queues whose running job is a Version's `active_job`: its loads, and resetting it. Not discarding
 * it: the discard route soft-deletes the Version, so it has left the list before its job runs.
 */
export const VERSION_ACTIVE_QUEUES: string[] = [...DATASET_LOAD_QUEUES, JobQueues.VERSION_RESET];

/**
 * Each of the given Datasets' unfinished work, keyed by slug, in one query:
 * - `queued`: its job waiting for a worker (`created`, or `retry` after an Interruption), on any locking queue but version-publish (its `queued_job`, see QUEUED_JOB_QUEUES);
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
       AND ((state IN ('created', 'retry') AND name = ANY($1)) OR (state = 'active' AND name = ANY($2)))`,
    [QUEUED_JOB_QUEUES, activeQueues, slugs],
  );
  for (const { id, queue, state, dataset_id } of rows) {
    (state === 'active' ? active : queued).set(dataset_id, { id, queue });
  }
  return { queued, active };
}

/**
 * The Versions, by slug, that a `version-publish` is publishing: queued or running. Read from pg-boss
 * rather than stored, like a load's `active_job`, so it clears however the job ends.
 */
export async function getPublishingVersions(entityManager: EntityManager, versionSlugs: string[]): Promise<Set<string>> {
  if (versionSlugs.length === 0) {
    return new Set();
  }
  const rows: { version_id: string }[] = await entityManager.query(
    `SELECT DISTINCT data->>'version_id' AS version_id
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = $1 AND state IN ('created', 'retry', 'active') AND data->>'version_id' = ANY($2)`,
    [JobQueues.VERSION_PUBLISH, versionSlugs],
  );
  return new Set(rows.map(row => row.version_id));
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
 * Refuses with 409 while the Dataset has a job on a locking queue that is Queued or running. A
 * Version is also locked by the `version-publish` publishing it, which names it by `version_id`.
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
     WHERE name = ANY($1) AND state IN ('created', 'retry', 'active')
       AND (data->>'dataset_id' = $2 OR (name = $3 AND data->>'version_id' = $2))
     ORDER BY created_on
     LIMIT 1`,
    [DATASET_LOCKING_QUEUES, dataset.slug, JobQueues.VERSION_PUBLISH],
  );
  if (job) {
    const state = job.state === 'active' ? 'running' : 'queued';
    throw new ErrorResponse(
      `Dataset '${dataset.name}' has a ${job.queue} job ${state} (${job.id}): try again once it finishes`,
      StatusCodes.CONFLICT,
    );
  }
}
