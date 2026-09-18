# ADR 0036: `getCoverage`/`getDatasets` borrow pooled connections instead of the request's transaction

**Status:** Accepted

## Context

`transactionMiddleware` gives every request one dedicated connection/transaction
(`req.customData.entityManager`) for its whole lifetime, committed or rolled back when the
response finishes or the client disconnects. `FilterService.getCoverage` and `getDatasets`
each run 2-3 independent, expensive read queries (`filterVector`/`filterRaster`/
`getRasterCoverage`, and `filterVectorDatasets`/`filterRaster`) via `Promise.all` on that
same shared `entityManager`.

This never actually ran concurrently: a Postgres connection processes one statement at a
time, and matching `pg_backend_pid()` across all three calls confirmed they shared the one
connection. `Promise.all` only appeared to fan out because `pg`'s `Client` silently queues
overlapping `.query()` calls on top of each other — a behavior that is deprecated and
scheduled for removal in `pg@9.0` ("Calling client.query() when the client is already
executing a query is deprecated..."). So this was a forward-compatibility bug, not just a
missed performance opportunity, and it compounds real latency: three slow queries pay their
cost serially instead of in parallel.

## Considered Options

- **Do nothing, rely on `pg`'s internal queuing** — rejected: it is explicitly deprecated and
  will stop working under a future `pg` major version; also leaves the serialized-latency
  problem unaddressed today.
- **Add these routes to `transactionMiddleware`'s skip list** — rejected: that would strip
  `req.customData.entityManager` for the *entire* request, including `getFilterById`'s own
  lookup, which has no concurrency need and no reason to give up transactional/cancellable
  behavior. Broader blast radius than the actual problem.
- **Borrow separate connections from the pool's shared default manager
  (`getEntityManager()`)** for just the independent sub-queries, chosen below.
- **Bump `connectionTimeoutMillis` on the shared pool** as a companion safety net (this
  change increases how many connections a single request can hold at once, see
  Consequences) — drafted, but explicitly deferred for now; left as a known, unaddressed
  risk rather than silently ignored.

## Decision

`getCoverage` and `getDatasets` call `getEntityManager()` (the pool's shared default
manager, not `requestData.entityManager`) for their independent sub-queries, so
`Promise.all` gets genuine concurrency: each `.query()` call on the default manager checks
out its own connection from the pool. `getFilterById` keeps using the request's
transactional connection — a single lookup with no parallelism to gain.

Two things had to be added to make this safe, both factored into
`backend/src/utils/cancelable-query.ts` as reusable primitives rather than inlined once:

- **`runCancelableQuery`**: `SET LOCAL work_mem` only holds for statements that follow it on
  the *same* connection within the *same* explicit transaction. A borrowed pool connection's
  individual `.query()` calls can each land on a different physical connection, so
  `SoilDataStorage`'s four affected methods (`filterVector`, `filterVectorDatasets`,
  `filterRaster`, `getRasterCoverage`) now wrap their `SET LOCAL` + query in one explicit
  `entityManager.transaction(...)` via this helper, guaranteeing both land together
  regardless of which kind of `entityManager` is passed in.
- **`withDisconnectSignal`**: `transactionMiddleware`'s own disconnect-driven cancellation
  (`cancelBackend()`) only cancels the one connection behind `req.customData.entityManager`
  — it knows nothing about connections borrowed elsewhere. `runCancelableQuery` accepts an
  optional `AbortSignal`; when given one, it captures the borrowed connection's own
  `pg_backend_pid()` and cancels it (via a second, separate connection, mirroring
  `transactionMiddleware`'s approach) if the signal fires before the query resolves.
  `withDisconnectSignal(res)` builds that signal from `res.on('close', ...)`, and the
  `getDataFilterCoverage`/`getDataFilterDatasets` controllers wire one in per request.

This is opt-in per endpoint: the global `transactionMiddleware` and every other route are
unchanged.

## Consequences

- The sub-queries in `getCoverage` (3) and `getDatasets` (2) now run on genuinely separate,
  concurrent connections instead of serializing on `pg`'s soon-to-be-removed internal
  queuing.
- This trades strict single-snapshot transactional consistency for per-query READ COMMITTED
  snapshots across those sub-queries — acceptable for a read-only coverage/dataset summary;
  would not be for a write path.
- Each request to these two endpoints now holds up to 3 (or 2) extra pooled connections
  instead of reusing the 1 already checked out for the request, so the shared pool
  (`poolSize: 50`) saturates at roughly a third as many concurrent requests to these
  endpoints as before. No `connectionTimeoutMillis` is configured on the pool, so once
  saturated, a caller waiting for a connection currently hangs indefinitely with no error or
  backpressure rather than failing fast. This is a known, currently-accepted risk, deferred
  rather than mitigated — worth revisiting before this pattern is applied to further
  endpoints or before these two see materially higher traffic.
- `runCancelableQuery`/`withDisconnectSignal` are generic (no `FilterService`/
  `SoilDataStorage`-specific knowledge baked in), so a future endpoint that wants the same
  borrowed-connection-with-cancellation pattern can reuse them directly instead of
  re-deriving this plumbing.
