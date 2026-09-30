# Queued is derived from the queue, not an Ingestion Status

A Dataset is **Queued** while `pgboss.job` holds a `created` `bulk-load`, `raster-load` or `bulk-delete` job whose `data.dataset_id` is its slug. It is computed on read and exposed to Privileged callers as a read-only `queued_job: { id, queue }`. `datasets.status` never holds it. While such a job is `created` or `active`, dataset edits and further jobs on those three queues return 409. A per-dataset `pg_advisory_xact_lock` serialises the check against the enqueue or the edit. `createJob` rewrites `dataset_id` to the current slug, so an old slug still matches.

## Considered options

- **A stored `QUEUED` Ingestion Status**: rejected. A job can leave `created` without our code running (cancel, retention sweep) or fail before it sets `ONGOING`, and `BulkDeleter`'s rollback `save()` would write `QUEUED` back. Each of these leaves the Dataset stuck, and the prior status must be kept somewhere to restore it.
- **Locking file staging too, with staging made Dataset-scoped**: rejected to keep `file-to-db`'s per-file API and the vector flow's parallel fan-out.

## Consequences

- `file-to-db` neither locks nor shows as Queued. A Bulk Load submitted while stagings run is accepted and skips the files not yet `STAGED`.
- The lock ends when pg-boss moves the job out of `active`, including a heartbeat reap. A reaped load still leaves `status = 'ONGOING'`, as before.
- File and mapping endpoints are not locked: deleting a File mid–Raster Load still fails the load.
