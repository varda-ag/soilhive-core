import { describe, it, expect, afterEach } from '@jest/globals';
import { NextFunction, Request, Response } from 'express';
import {
  CACHE_BYPASS_APPLIED_VALUE,
  CACHE_BYPASS_HEADER,
  cacheBypassMiddleware,
  isCacheBypassEnabled,
  isCacheBypassed,
} from '../../src/utils/cache-bypass';

const SECRET = 'correct-horse-battery-staple';

interface Outcome {
  bypassedInsideRequest: boolean;
  nextCalled: boolean;
  echoedHeader: string | undefined;
}

/**
 * Runs the middleware over a minimal request and reports what the downstream
 * handler would observe. isCacheBypassed() is sampled *inside* next, since the
 * whole point is that the context exists only for the duration of the request.
 */
const run = (headers: Record<string, unknown>): Outcome => {
  const outcome: Outcome = { bypassedInsideRequest: false, nextCalled: false, echoedHeader: undefined };
  const res = {
    setHeader: (name: string, value: string) => {
      if (name === CACHE_BYPASS_HEADER) outcome.echoedHeader = value;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    outcome.nextCalled = true;
    outcome.bypassedInsideRequest = isCacheBypassed();
  };
  cacheBypassMiddleware({ headers } as unknown as Request, res, next);
  return outcome;
};

afterEach(() => {
  delete process.env['CACHE_BYPASS_SECRET'];
});

describe('cacheBypassMiddleware', () => {
  it('bypasses and echoes confirmation when the secret matches', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    const outcome = run({ [CACHE_BYPASS_HEADER]: SECRET });
    expect(outcome.bypassedInsideRequest).toBe(true);
    expect(outcome.echoedHeader).toBe(CACHE_BYPASS_APPLIED_VALUE);
    expect(outcome.nextCalled).toBe(true);
  });

  // Fails closed: without a configured secret the header must not exist at all,
  // because the cached endpoints are unauthenticated (docs/adr/0028).
  it('ignores the header when no secret is configured, even if a value is sent', () => {
    const outcome = run({ [CACHE_BYPASS_HEADER]: SECRET });
    expect(outcome.bypassedInsideRequest).toBe(false);
    expect(outcome.echoedHeader).toBeUndefined();
    expect(outcome.nextCalled).toBe(true);
  });

  it('ignores an empty configured secret rather than matching an empty header', () => {
    process.env['CACHE_BYPASS_SECRET'] = '';
    const outcome = run({ [CACHE_BYPASS_HEADER]: '' });
    expect(outcome.bypassedInsideRequest).toBe(false);
    expect(outcome.echoedHeader).toBeUndefined();
  });

  it('does not bypass when the secret is wrong', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    const outcome = run({ [CACHE_BYPASS_HEADER]: 'wrong' });
    expect(outcome.bypassedInsideRequest).toBe(false);
    expect(outcome.echoedHeader).toBeUndefined();
    expect(outcome.nextCalled).toBe(true);
  });

  // A length mismatch must not be an early return that skips the digest compare.
  it('does not bypass when the secret is a prefix of the expected value', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    expect(run({ [CACHE_BYPASS_HEADER]: SECRET.slice(0, 5) }).bypassedInsideRequest).toBe(false);
  });

  it('does not bypass an ordinary request that sends no header', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    const outcome = run({});
    expect(outcome.bypassedInsideRequest).toBe(false);
    expect(outcome.echoedHeader).toBeUndefined();
    expect(outcome.nextCalled).toBe(true);
  });

  // Express hands back an array for a repeated header; it must not be coerced.
  it('does not bypass when the header is repeated', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    expect(run({ [CACHE_BYPASS_HEADER]: [SECRET, SECRET] }).bypassedInsideRequest).toBe(false);
  });

  // Jobs, startup and migrations run outside any request and must never bypass.
  it('reports no bypass outside a request context', () => {
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    run({ [CACHE_BYPASS_HEADER]: SECRET });
    expect(isCacheBypassed()).toBe(false);
  });
});

describe('isCacheBypassEnabled', () => {
  it('is false unless a non-empty secret is configured', () => {
    expect(isCacheBypassEnabled()).toBe(false);
    process.env['CACHE_BYPASS_SECRET'] = '';
    expect(isCacheBypassEnabled()).toBe(false);
    process.env['CACHE_BYPASS_SECRET'] = SECRET;
    expect(isCacheBypassEnabled()).toBe(true);
  });
});
