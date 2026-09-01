import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Per-request opt-out from the query-result cache (docs/adr/0028), so a
 * measurement client can observe cold application work against a deployed
 * environment without changing that deployment or perturbing its inputs.
 *
 * The header is namespaced so no proxy, CDN or framework header can collide
 * with it, and named for its effect rather than its first caller. A query
 * parameter could not have carried this: validateRequests in
 * middlewares/openapi.ts rejects undeclared query parameters, while undeclared
 * headers pass through — so nothing has to be added to openapi.yaml. Honouring
 * the standard `Cache-Control: no-cache` was rejected: every browser
 * hard-refresh sends it, and it has nowhere to carry the secret.
 */
export const CACHE_BYPASS_HEADER = 'x-soilhive-cache-bypass';

/**
 * Echoed back on every bypassed response. A deployment whose secret is
 * misconfigured, whose build predates this feature, or that sits behind a proxy
 * stripping unknown headers answers with an ordinary 200 — indistinguishable
 * from a honoured bypass without this echo, which would let a client record cold
 * numbers it never measured. A client is expected to require the echo as a
 * precondition before it measures anything (docs/adr/0028).
 */
export const CACHE_BYPASS_APPLIED_VALUE = 'applied';

/**
 * Set for the duration of a request that presented the correct secret. Follows
 * utils/query-debug.ts, which already proves a store opened in middleware is
 * visible inside TypeORM's own cache callbacks. Code running outside a request
 * — pg-boss jobs, startup, migrations — finds no store, so it can never bypass
 * by accident.
 */
const requestContext = new AsyncLocalStorage<true>();

/** True only inside a request that presented the correct bypass secret. */
export const isCacheBypassed = (): boolean => requestContext.getStore() === true;

/**
 * Fails closed: where CACHE_BYPASS_SECRET is unset the header does not exist,
 * so an environment has no bypass capability until deliberately given one.
 * This matters because /data-filters, /dai, /coverage and /soil-data are
 * unauthenticated and the cache is what makes them survivable — an ungated
 * bypass header would be an amplification vector.
 */
export const isCacheBypassEnabled = (): boolean => (process.env['CACHE_BYPASS_SECRET'] ?? '').length > 0;

/**
 * Compared over digests rather than the raw strings so that a length mismatch
 * is not itself an early return, and never with ===.
 */
const secretMatches = (provided: string, expected: string): boolean =>
  timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest());

/**
 * Opens the bypass context for requests carrying the correct secret and leaves
 * every other request untouched. Registered before /health and /ready so a
 * client's echo preflight can use the cheapest endpoint here.
 */
export const cacheBypassMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env['CACHE_BYPASS_SECRET'] ?? '';
  const provided = req.headers[CACHE_BYPASS_HEADER];
  if (expected.length === 0 || typeof provided !== 'string' || !secretMatches(provided, expected)) {
    return next();
  }
  res.setHeader(CACHE_BYPASS_HEADER, CACHE_BYPASS_APPLIED_VALUE);
  requestContext.run(true, next);
};
