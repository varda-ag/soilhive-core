import { LRUCache } from 'lru-cache';
import { EntityManager } from 'typeorm';
import { QueryResultCache } from 'typeorm/cache/QueryResultCache';
import { QueryResultCacheOptions } from 'typeorm/cache/QueryResultCacheOptions';
import { log } from './logger';
import { isJest } from './utils';

// Staleness contract (see docs/adr/0008): every write path that feeds cached
// queries - ingestion jobs and the REST mutations (dataset update/delete,
// direct soil-data POST, file delete, reference-data creates) — bumps the
// cache_epoch table, and every node clears its cache within the epoch poll
// interval (utils/cache-epoch.ts). Freshness is bounded by that poll interval;
// these TTLs are only a backstop for when the watcher is down. A new write
// path that affects cached results MUST call bumpCacheEpoch().
export const CACHE_TTL_SPATIAL_MS = 12 * 60 * 60_000;
export const CACHE_TTL_REFERENCE_MS = 12 * 60 * 60_000;

const MAX_ENTRIES = 1024;
const STATS_LOG_INTERVAL_MS = 5 * 60_000;

export const isQueryCacheEnabled = () => process.env['QUERY_CACHE_ENABLED'] !== 'false' && !isJest();

// Single shared store for all three cache paths (TypeORM provider, cachedQuery,
// cachedCompute): LRU eviction on usage, then per-entry TTL. TTL is not refreshed
// on read. Values are stored by reference — cached results must not be mutated.
const cache = new LRUCache<string, object>({ max: MAX_ENTRIES });

const stats = { hits: 0, misses: 0 };
let statsTimer: NodeJS.Timeout | undefined;

const trackLookup = <T>(value: T | undefined): T | undefined => {
  if (value === undefined) {
    stats.misses++;
  } else {
    stats.hits++;
  }
  if (!statsTimer) {
    statsTimer = setInterval(() => {
      log.info('Query cache stats', { ...stats, size: cache.size });
    }, STATS_LOG_INTERVAL_MS);
    statsTimer.unref();
  }
  return value;
};

/** Test hook: drop all entries and reset counters. */
export const resetQueryCache = (): void => {
  cache.clear();
  stats.hits = 0;
  stats.misses = 0;
};

/**
 * Cache the result of an arbitrary computation. The caller is responsible for
 * building a key that covers every input the result depends on — prefer
 * cachedQuery (or TypeORM's .cache()) where possible, since those derive the
 * key mechanically from SQL + parameters.
 */
export const cachedCompute = async <T extends object>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> => {
  if (!isQueryCacheEnabled()) {
    return compute();
  }
  const hit = trackLookup(cache.get(key));
  if (hit !== undefined) {
    return hit as T;
  }
  const value = await compute();
  cache.set(key, value, { ttl: ttlMs });
  return value;
};

/**
 * Cached counterpart of entityManager.query(sql, params) for raw-SQL call sites,
 * which TypeORM's .cache() cannot see. The key is derived from the SQL text plus
 * bound parameters — the same guarantee as TypeORM's query cache.
 */
export const cachedQuery = async <T extends object>(
  entityManager: EntityManager,
  sql: string,
  params: unknown[],
  ttlMs: number,
): Promise<T> => {
  return cachedCompute(`sql:${sql}|${JSON.stringify(params)}`, ttlMs, () => entityManager.query(sql, params));
};

/**
 * In-memory QueryResultCache for TypeORM's opt-in query cache (.cache(ttl) /
 * find({ cache: ttl })). The default "database" store is unusable here: its
 * writes go through the request's transactional query runner, and
 * transactionMiddleware rolls GET transactions back. TypeORM JSON-stringifies
 * results before storeInCache and parses on every hit, so entries on this path
 * are strings and hits always return fresh objects.
 */
export class InMemoryQueryResultCache implements QueryResultCache {
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async synchronize(): Promise<void> {}

  async getFromCache(options: QueryResultCacheOptions): Promise<QueryResultCacheOptions | undefined> {
    return trackLookup(cache.get(this.key(options)) as QueryResultCacheOptions | undefined);
  }

  async storeInCache(options: QueryResultCacheOptions): Promise<void> {
    cache.set(this.key(options), options, { ttl: options.duration });
  }

  isExpired(savedCache: QueryResultCacheOptions): boolean {
    return (savedCache.time ?? 0) + savedCache.duration < Date.now();
  }

  async clear(): Promise<void> {
    cache.clear();
  }

  async remove(identifiers: string[]): Promise<void> {
    for (const identifier of identifiers) {
      cache.delete(`typeorm:id:${identifier}`);
    }
  }

  // Explicit cache ids are supported for completeness but should not be used:
  // a fixed id defeats the SQL+params key derivation and collides across inputs.
  private key(options: QueryResultCacheOptions): string {
    return options.identifier ? `typeorm:id:${options.identifier}` : `typeorm:q:${options.query}`;
  }
}
