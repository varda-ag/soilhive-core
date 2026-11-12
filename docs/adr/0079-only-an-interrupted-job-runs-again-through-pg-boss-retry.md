# Only an interrupted job runs again, through pg-boss's retry

An Attempt cut short by an Interruption (a heartbeat reap, or a shutdown) is retried by pg-boss itself: every queue has `retryLimit: 2` and `retryDelay: 60`, with no backoff. Every other failure is final. `runJob` returns `deadletter` (with `perJobResults`) for anything the job throws. Each Attempt also starts with a check that ends the job as `deadletter` if `retryCount > 0` and the previous `output` is not an Interruption, which covers the expiry timeouts pg-boss fails on its own. On SIGTERM the backend calls `boss.stop({ graceful: true, timeout: 20_000 })` and exits.

## Considered options

- **Restarting heartbeat-failed jobs at app startup**: rejected. The reap comes about 5 minutes after the crash, so a restarted pod finds the job still `active`. Every pod would race to restart it, nothing restarts after a scale-down, and nothing limits a job that crashes its pod every time.
- **Retrying every failure**: rejected. A `JobError` fails the same way again.
- **Aborting a stale worker when `updateJobState` finds no `active` row**: rejected. A retry reuses the job id, so the row is `active` again for the next Attempt. Nothing runs while the event loop is blocked.

## Consequences

- Every job must be safe to run again from the start, after being cut off at any point. BULK_DELETE, VERSION_PUBLISH and RASTER_FILTER_INSTALL were changed to resume.
- A job in `retry` is Queued and keeps its Dataset, Version or Raster Filter locked (amends ADR 0042).
- The process must exit after `stop()`: handlers ignore `job.signal` and would otherwise overlap the next Attempt. Kubernetes' grace period must exceed 20s.
- After a shutdown, pg-boss fails the job a second time with "perJobResults handler must resolve with an array of job results", because the abort resolves the handler's race with nothing. That message counts as an Interruption too.
- A worker that lost its job while still alive is not fenced. pg-boss completes a job by id and `active` state only, so it could settle the next Attempt.
- A job that hangs while its worker stays alive keeps its heartbeat, so it is still bounded only by the 24h expiry.
