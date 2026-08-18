import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { EntityManager } from 'typeorm';
import { QueryResultCacheOptions } from 'typeorm/cache/QueryResultCacheOptions';
import { CACHE_BYPASS_HEADER, cacheBypassMiddleware } from '../../src/utils/cache-bypass';
import {
  CACHE_TTL_REFERENCE_MS,
  CACHE_TTL_SPATIAL_MS,
  InMemoryQueryResultCache,
  cachedCompute,
  cachedQuery,
  isQueryCacheEnabled,
  resetQueryCache,
} from '../../src/utils/query-cache';

const SECRET = 'cache-bypass-secret';

/**
 * isQueryCacheEnabled() is forced off under jest, so every cache path in this
 * module is unreachable from a test until the jest markers are lifted. Doing so
 * is safe here because these tests exercise the store alone — no DataSource, no
 * app, nothing else that changes behaviour when it believes it is not in a test.
 * Jest sets NODE_ENV=test itself, so both markers have to go.
 */
const enableCache = (): void => {
  delete process.env['JEST_WORKER_ID'];
  process.env['NODE_ENV'] = 'query-cache-test';
  delete process.env['QUERY_CACHE_ENABLED'];
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs fn inside a request that presented the correct bypass secret, going
 * through the real middleware rather than reaching into its AsyncLocalStorage —
 * the bypass is only meaningful as the middleware actually establishes it.
 */
const inBypassedRequest = <T>(fn: () => Promise<T>): Promise<T> => {
  process.env['CACHE_BYPASS_SECRET'] = SECRET;
  let result: Promise<T> | undefined;
  cacheBypassMiddleware(
    { headers: { [CACHE_BYPASS_HEADER]: SECRET } } as unknown as Request,
    { setHeader: () => {} } as unknown as Response,
    () => {
      result = fn();
    },
  );
  if (result === undefined) throw new Error('middleware did not call next');
  return result;
};

/** Minimal EntityManager: cachedQuery only ever calls .query(sql, params). */
const fakeEntityManager = () => {
  const query = jest.fn(async (_sql: string, _params: unknown[]) => [{ count: '1' }]);
  return { manager: { query } as unknown as EntityManager, query };
};

const cacheOptions = (overrides: Partial<QueryResultCacheOptions> = {}): QueryResultCacheOptions => ({
  query: 'SELECT 1',
  duration: CACHE_TTL_REFERENCE_MS,
  time: Date.now(),
  result: [{ n: 1 }],
  ...overrides,
});

let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = {
    JEST_WORKER_ID: process.env['JEST_WORKER_ID'],
    NODE_ENV: process.env['NODE_ENV'],
    QUERY_CACHE_ENABLED: process.env['QUERY_CACHE_ENABLED'],
    CACHE_BYPASS_SECRET: process.env['CACHE_BYPASS_SECRET'],
  };
  resetQueryCache();
});

afterEach(() => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetQueryCache();
});

describe('isQueryCacheEnabled', () => {
  it('is off under jest regardless of the env var, so tests never read a stale value', () => {
    expect(isQueryCacheEnabled()).toBe(false);
    process.env['QUERY_CACHE_ENABLED'] = 'true';
    expect(isQueryCacheEnabled()).toBe(false);
  });

  it('is on by default outside jest', () => {
    enableCache();
    expect(isQueryCacheEnabled()).toBe(true);
  });

  it('is off when the killswitch is set to exactly "false"', () => {
    enableCache();
    process.env['QUERY_CACHE_ENABLED'] = 'false';
    expect(isQueryCacheEnabled()).toBe(false);
    // Only the literal 'false' disables it; anything else leaves the cache on.
    process.env['QUERY_CACHE_ENABLED'] = 'FALSE';
    expect(isQueryCacheEnabled()).toBe(true);
    process.env['QUERY_CACHE_ENABLED'] = '0';
    expect(isQueryCacheEnabled()).toBe(true);
  });
});

describe('cachedCompute', () => {
  it('computes every time while the cache is disabled', async () => {
    const compute = jest.fn(async () => ({ value: 1 }));
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute);
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('computes once for a repeated key', async () => {
    enableCache();
    const compute = jest.fn(async () => ({ value: 1 }));
    expect(await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute)).toEqual({ value: 1 });
    expect(await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute)).toEqual({ value: 1 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  // Documented contract of this path: entries are stored by reference, with no
  // serialisation round-trip, so callers must not mutate what they get back.
  it('returns the identical object on a hit rather than a copy', async () => {
    enableCache();
    const value = { rows: [1, 2, 3] };
    const first = await cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => value);
    const second = await cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ rows: [] }));
    expect(first).toBe(value);
    expect(second).toBe(value);
  });

  it('keeps distinct keys independent', async () => {
    enableCache();
    await cachedCompute('a', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'a' }));
    expect(await cachedCompute('b', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'b' }))).toEqual({ value: 'b' });
    expect(await cachedCompute('a', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'recomputed' }))).toEqual({ value: 'a' });
  });

  it('recomputes once the entry TTL has passed', async () => {
    enableCache();
    const compute = jest.fn(async () => ({ value: 1 }));
    await cachedCompute('key', 20, compute);
    await sleep(60);
    await cachedCompute('key', 20, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes after resetQueryCache drops the entry', async () => {
    enableCache();
    const compute = jest.fn(async () => ({ value: 1 }));
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute);
    resetQueryCache();
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('cachedQuery', () => {
  it('runs the query once for identical SQL and parameters', async () => {
    enableCache();
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT count(*) FROM features WHERE id = $1', ['a'], CACHE_TTL_SPATIAL_MS);
    await cachedQuery(manager, 'SELECT count(*) FROM features WHERE id = $1', ['a'], CACHE_TTL_SPATIAL_MS);
    expect(query).toHaveBeenCalledTimes(1);
  });

  // The key is derived from SQL + parameters precisely so a changed parameter
  // cannot collide with a previous result (docs/adr/0008).
  it('treats different parameters as different entries', async () => {
    enableCache();
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT 1 WHERE id = $1', ['a'], CACHE_TTL_SPATIAL_MS);
    await cachedQuery(manager, 'SELECT 1 WHERE id = $1', ['b'], CACHE_TTL_SPATIAL_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('treats different SQL as different entries', async () => {
    enableCache();
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT 1', [], CACHE_TTL_SPATIAL_MS);
    await cachedQuery(manager, 'SELECT 2', [], CACHE_TTL_SPATIAL_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('passes SQL and parameters through to the entity manager unchanged', async () => {
    enableCache();
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT $1::int', [7], CACHE_TTL_SPATIAL_MS);
    expect(query).toHaveBeenCalledWith('SELECT $1::int', [7]);
  });

  it('runs the query every time while the cache is disabled', async () => {
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT 1', [], CACHE_TTL_SPATIAL_MS);
    await cachedQuery(manager, 'SELECT 1', [], CACHE_TTL_SPATIAL_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

// The cache-transparent contract of docs/adr/0028: a bypassed request must
// neither read nor write, so it measures real work and leaves the shared store
// exactly as it found it.
describe('cache bypass', () => {
  it('does not read an existing entry', async () => {
    enableCache();
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'cached' }));
    const compute = jest.fn(async () => ({ value: 'fresh' }));
    expect(await inBypassedRequest(() => cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute))).toEqual({ value: 'fresh' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('leaves an existing entry intact for later warm requests', async () => {
    enableCache();
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'cached' }));
    await inBypassedRequest(() => cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'fresh' })));
    const compute = jest.fn(async () => ({ value: 'recomputed' }));
    expect(await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute)).toEqual({ value: 'cached' });
    expect(compute).not.toHaveBeenCalled();
  });

  it("does not populate the cache on a miss, so it cannot evict other clients' entries", async () => {
    enableCache();
    await inBypassedRequest(() => cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ value: 'fresh' })));
    const compute = jest.fn(async () => ({ value: 'warm' }));
    expect(await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute)).toEqual({ value: 'warm' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('runs raw-SQL queries for real', async () => {
    enableCache();
    const { manager, query } = fakeEntityManager();
    await cachedQuery(manager, 'SELECT 1', [], CACHE_TTL_SPATIAL_MS);
    await inBypassedRequest(() => cachedQuery(manager, 'SELECT 1', [], CACHE_TTL_SPATIAL_MS));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('makes the TypeORM provider miss without disturbing the stored entry', async () => {
    enableCache();
    const provider = new InMemoryQueryResultCache();
    const options = cacheOptions();
    await provider.storeInCache(options);
    expect(await inBypassedRequest(() => provider.getFromCache(options))).toBeUndefined();
    expect(await provider.getFromCache(options)).toBe(options);
  });

  it('makes the TypeORM provider skip storing', async () => {
    enableCache();
    const provider = new InMemoryQueryResultCache();
    const options = cacheOptions();
    await inBypassedRequest(() => provider.storeInCache(options));
    expect(await provider.getFromCache(options)).toBeUndefined();
  });
});

describe('InMemoryQueryResultCache', () => {
  it('stores and returns an entry keyed by its query text', async () => {
    const provider = new InMemoryQueryResultCache();
    const options = cacheOptions({ query: 'SELECT a FROM b' });
    await provider.storeInCache(options);
    expect(await provider.getFromCache(cacheOptions({ query: 'SELECT a FROM b' }))).toBe(options);
    expect(await provider.getFromCache(cacheOptions({ query: 'SELECT c FROM d' }))).toBeUndefined();
  });

  it('keys by identifier when one is set, ignoring the query text', async () => {
    const provider = new InMemoryQueryResultCache();
    const options = cacheOptions({ identifier: 'fixed-id', query: 'SELECT a' });
    await provider.storeInCache(options);
    expect(await provider.getFromCache(cacheOptions({ identifier: 'fixed-id', query: 'SELECT something else' }))).toBe(options);
  });

  it('removes entries by identifier', async () => {
    const provider = new InMemoryQueryResultCache();
    const identified = cacheOptions({ identifier: 'id-1' });
    const byQuery = cacheOptions({ query: 'SELECT keep-me' });
    await provider.storeInCache(identified);
    await provider.storeInCache(byQuery);
    await provider.remove(['id-1']);
    expect(await provider.getFromCache(identified)).toBeUndefined();
    expect(await provider.getFromCache(byQuery)).toBe(byQuery);
  });

  it('clears every entry, including those stored through cachedCompute', async () => {
    enableCache();
    const provider = new InMemoryQueryResultCache();
    const options = cacheOptions();
    await provider.storeInCache(options);
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, async () => ({ value: 1 }));
    await provider.clear();
    expect(await provider.getFromCache(options)).toBeUndefined();
    const compute = jest.fn(async () => ({ value: 2 }));
    await cachedCompute('key', CACHE_TTL_SPATIAL_MS, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('reports expiry from the entry time plus its duration', () => {
    const provider = new InMemoryQueryResultCache();
    expect(provider.isExpired(cacheOptions({ time: Date.now(), duration: 60_000 }))).toBe(false);
    expect(provider.isExpired(cacheOptions({ time: Date.now() - 120_000, duration: 60_000 }))).toBe(true);
    // A missing time is treated as epoch 0, i.e. long expired, never as fresh.
    expect(provider.isExpired(cacheOptions({ time: undefined, duration: 60_000 }))).toBe(true);
  });

  it('has no-op lifecycle methods, since the store is a module-level LRU', async () => {
    const provider = new InMemoryQueryResultCache();
    await expect(provider.connect()).resolves.toBeUndefined();
    await expect(provider.disconnect()).resolves.toBeUndefined();
    await expect(provider.synchronize()).resolves.toBeUndefined();
  });
});
