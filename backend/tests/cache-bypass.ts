import { Request, Response } from 'express';
import { CACHE_BYPASS_HEADER, cacheBypassMiddleware } from '../src/utils/cache-bypass';

export const CACHE_BYPASS_TEST_SECRET = 'cache-bypass-secret';

/**
 * Runs fn inside a request that presented the correct bypass secret, going
 * through the real middleware rather than reaching into its AsyncLocalStorage —
 * the bypass is only meaningful as the middleware actually establishes it.
 * Sets CACHE_BYPASS_SECRET; the caller restores it.
 */
export const inBypassedRequest = <T>(fn: () => Promise<T>): Promise<T> => {
  process.env['CACHE_BYPASS_SECRET'] = CACHE_BYPASS_TEST_SECRET;
  let result: Promise<T> | undefined;
  cacheBypassMiddleware(
    { headers: { [CACHE_BYPASS_HEADER]: CACHE_BYPASS_TEST_SECRET } } as unknown as Request,
    { setHeader: () => {} } as unknown as Response,
    () => {
      result = fn();
    },
  );
  if (result === undefined) throw new Error('middleware did not call next');
  return result;
};
