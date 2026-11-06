import { EntityManager, QueryFailedError } from 'typeorm';
import { getEntityManager } from '../../utils/data-source';
import { log } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';
import { getPgBoss, PG_BOSS_SCHEMA } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';
import { VersionDiscardJob } from '../../interfaces/Job';

// Rows deleted per statement, each in a transaction of its own
export const SWEEP_BATCH_SIZE = 1000;

// Postgres: foreign_key_violation
const FOREIGN_KEY_VIOLATION_CODE = '23503';

/**
 * The shared rows a Dataset's data references, and what references them. Licences are left out:
 * they are managed on their own and named by datasets.licenses too, so one no layer uses is not an orphan.
 */
const SWEPT = [
  { table: 'features', unreferenced: `NOT EXISTS (SELECT 1 FROM dataset_layers dl WHERE dl.feature_id = t.id)` },
  { table: 'layers', unreferenced: `NOT EXISTS (SELECT 1 FROM dataset_layers dl WHERE dl.layer_id = t.id)` },
];

/**
 * Queues a sweep, for a job that has just deleted Dataset Layers (a purge, a version reset or discard)
 * and left their features and layers to it. Only logged on failure: the daily sweep catches up.
 */
export const queueOrphanSweep = async (): Promise<void> => {
  try {
    await getPgBoss().send(JobQueues.SWEEP_ORPHAN_ROWS, {});
  } catch (error) {
    log.warn('Failed to queue the orphan sweep', { error: getErrorMessage(error) });
  }
};

/**
 * Deletes the features and layers no Dataset Layer references any more, which deleting a Dataset's
 * Dataset Layers leaves behind (DatasetRows.deleteDatasetLayers): the Purge (BulkDeleter), and
 * resetting or discarding a Version. Scheduled, and queued after each of them.
 *
 * A load that has just referenced a row in a batch makes that batch fail its foreign key check when
 * the load commits first. The sweep then stops, and the next run retries: safe, only slower.
 */
export async function processSweepOrphanRows(): Promise<void> {
  const entityManager = await getEntityManager();
  const requeued = await requeueUnfinishedDiscards(entityManager);
  if (requeued > 0) {
    log.info('Discards of versions left discarded queued again', { requeued });
  }
  for (const { table, unreferenced } of SWEPT) {
    const deleted = await sweepTable(entityManager, table, unreferenced);
    log.info('Orphan rows swept', { table, deleted });
  }
}

/**
 * Queues the discard again of each Version a failed discard left discarded: soft-deleted, with its
 * data. A discard that succeeds hard-deletes its Version, and one that fails puts it back
 * (restoreDiscardedVersion), unless a new Version of the same Dataset was opened in the meantime. So
 * any soft-deleted Version is one of those, which no list shows and no admin can retry.
 *
 * Skips a Version whose discard is still queued or running: the discard route queues it before the
 * soft-delete. Reuses the last discard's data, so it runs for the same submitter; failed jobs are kept
 * for 30 days, which the daily sweep stays well within. Returns how many were queued.
 */
export async function requeueUnfinishedDiscards(entityManager: EntityManager): Promise<number> {
  const rows: { slug: string; data: VersionDiscardJob | null }[] = await entityManager.query(
    `SELECT v.slug, last.data
     FROM datasets v
     LEFT JOIN LATERAL (
       SELECT j.data FROM ${PG_BOSS_SCHEMA}.job j
       WHERE j.name = $1 AND j.data->>'dataset_id' = v.slug
       ORDER BY j.created_on DESC
       LIMIT 1
     ) last ON true
     WHERE v.version_of IS NOT NULL
       AND v.deleted_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM ${PG_BOSS_SCHEMA}.job u
         WHERE u.name = $1 AND u.data->>'dataset_id' = v.slug AND u.state IN ('created', 'retry', 'active')
       )`,
    [JobQueues.VERSION_DISCARD],
  );
  for (const { slug, data } of rows) {
    // Its errors stay with the failed job; the job reads none of the rest but the slug and submitter
    const { errors: _errors, ...previous } = (data ?? {}) as VersionDiscardJob & { errors?: unknown };
    await getPgBoss().send(JobQueues.VERSION_DISCARD, { ...previous, dataset_id: slug });
  }
  return rows.length;
}

const sweepTable = async (entityManager: EntityManager, table: string, unreferenced: string): Promise<number> => {
  let total = 0;
  while (true) {
    let deleted: number;
    try {
      // SKIP LOCKED leaves the rows another sweep, or a statement already holding them, has locked
      const [, count]: [unknown, number] = await entityManager.query(
        `WITH batch AS (
           SELECT t.id FROM ${table} t
           WHERE ${unreferenced}
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         DELETE FROM ${table} WHERE id IN (SELECT id FROM batch)`,
        [SWEEP_BATCH_SIZE],
      );
      deleted = count;
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === FOREIGN_KEY_VIOLATION_CODE) {
        log.info('Orphan sweep stopped by a concurrent load, the next run retries', { table });
        return total;
      }
      throw error;
    }
    total += deleted;
    if (deleted < SWEEP_BATCH_SIZE) {
      return total;
    }
  }
};
