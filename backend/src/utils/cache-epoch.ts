import { getDataSource } from './data-source';
import { isQueryCacheEnabled, resetQueryCache } from './query-cache';
import { log } from './logger';
import { getErrorMessage } from './error';

// Cross-node cache invalidation signal (see docs/adr/0008): the query cache is
// per-process and nodes have no channel to each other, but they all share
// Postgres. Ingestion jobs bump a version counter in the cache_epoch table;
// every node polls it and drops its local cache when the version changes, so
// post-ingest staleness is bounded by the poll interval instead of the TTL.
// The TTLs stay on as a backstop in case the watcher is down.
const POLL_INTERVAL_MS = 30_000;

// Single-row table
const SEED_ROW_SQL = `INSERT INTO cache_epoch (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

let pollTimer: NodeJS.Timeout | undefined;
let knownVersion: string | undefined;

const readVersion = async (): Promise<string> => {
  const dataSource = await getDataSource();
  const rows: { version: string }[] = await dataSource.query('SELECT version FROM cache_epoch WHERE id = 1');
  if (!rows.length) {
    throw new Error('cache_epoch row missing');
  }
  return rows[0]!.version;
};

/**
 * Signal all nodes that cached data changed. Called by data-mutating pg-boss
 * jobs on completion and by REST write paths; must never fail the caller, so
 * errors are logged and swallowed. The local cache is cleared immediately;
 * other nodes follow on their next poll.
 *
 * knownVersion is deliberately NOT updated here: REST writes run inside
 * transactionMiddleware and call this before their transaction commits, so a
 * concurrent request can re-cache pre-commit data right after the clear. By
 * leaving knownVersion stale, this node's own next poll sees the new version
 * and clears once more — after the commit — bounding that race to the poll
 * interval instead of the TTL.
 */
export const bumpCacheEpoch = async (): Promise<void> => {
  try {
    const dataSource = await getDataSource();
    const rows: { version: string }[] = await dataSource.query(
      'UPDATE cache_epoch SET version = version + 1, updated_at = now() WHERE id = 1 RETURNING version',
    );
    resetQueryCache();
    log.info('Cache epoch bumped', { version: rows[0]?.version });
  } catch (error) {
    log.warn('Failed to bump cache epoch; other nodes will serve stale data until TTL', { error: getErrorMessage(error) });
  }
};

const poll = async (): Promise<void> => {
  try {
    const version = await readVersion();
    if (knownVersion !== undefined && version !== knownVersion) {
      resetQueryCache();
      log.info('Query cache cleared: data changed on another node', { version });
    }
    knownVersion = version;
  } catch (error) {
    log.warn('Cache epoch poll failed; falling back to TTL expiry', { error: getErrorMessage(error) });
  }
};

export const startCacheEpochWatcher = async (): Promise<void> => {
  if (pollTimer || !isQueryCacheEnabled()) {
    return;
  }
  const dataSource = await getDataSource();
  await dataSource.query(SEED_ROW_SQL);
  knownVersion = await readVersion();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  pollTimer.unref();
  log.info('Cache epoch watcher started', { version: knownVersion, pollIntervalMs: POLL_INTERVAL_MS });
};

/** Test hook. */
export const stopCacheEpochWatcher = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  knownVersion = undefined;
};
