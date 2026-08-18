# Entitlements are destroyed by the Purge, not the Archive

Deleting a Dataset is two operations: `DatasetService.deleteDataset` performs an **Archive** (status `ARCHIVED`, `deleted_at` set, all soil data intact, reversible), and the `bulk-delete` job performs a **Purge** (hard-deletes DatasetLayers or RasterLayers and cascades, calling `deleteDataset` as its first step). We decided that removing a Dataset's locally held Entitlements belongs to the Purge — inside the purge transaction in `BulkDeleter`, above the data-type fork — and not to `deleteDataset`, even though `deleteDataset` is where a reader would expect to find it.

The reason is that an Entitlement lives in a jsonb key, and stripping one is an unjournalled write: there is no `deleted_at` on a jsonb key. The Archive, by contrast, is reversible *by design* — `BulkDeleter` rolls back the soft-delete when the purge transaction fails or exceeds its 5-minute `statement_timeout`. Putting the strip in `deleteDataset` would mean a failed Purge resurrects the Dataset with every Entitlement to it silently and irrecoverably gone: nobody can reconstruct who was entitled, because the only record of it was the key that was deleted. Inside the purge transaction, a rollback takes the strip down with it, so a Dataset is either wholly present or wholly gone.

## Considered options

- **Inside `deleteDataset`** (rejected). What the ticket asked for and where the code reads most naturally. Rejected for the rollback hole above, and because Entitlements to an Archived Dataset are not yet meaningless — the Dataset can come back, and its access data should come back with it.
- **Gated on `deleteDataset`'s existing `syncDaiRefresh` flag** (rejected). Same runtime effect, but overloads a flag that means "the caller will hard-delete `dataset_layers` next, so refresh the DAI inline" with a second, unrelated meaning.
- **A separate short transaction after the purge** (rejected). Keeps `entitlements` row locks brief, but forfeits the atomicity that is the entire point.

## Consequences

- `DELETE /datasets/{datasetId}` is an Archive alone and reaches no Purge, so a Dataset deleted through that endpoint keeps all of its Entitlements indefinitely. This is accepted rather than overlooked: the endpoint also leaves every DatasetLayer, Observation, Feature and Layer intact, and a soft-deleted Dataset is excluded from every query, so those Entitlements are unreachable rather than leaked. The frontend does not use this endpoint — its delete action enqueues a `bulk-delete` job.
- Only *locally held* Entitlements are destroyed. The external entitlements endpoint may keep answering with the purged Dataset's slug; that is outside the system's reach and is inert for the same reason.
- `deleteEntityEntitlements` was made history-aware in the same change (it strips every slug from `getEntitySlugs`, matching what `getEntityEntitlements` already resolves on read) and given a `WHERE data ?| array[:...slugs]` predicate so it no longer rewrites and locks every row of the table. Neither is a trade-off; both are prerequisites for running the strip safely inside a long transaction.
- `tests/jobs/bulk-delete/BulkDeleter.test.ts` asserts that a rolled-back Purge leaves Entitlements intact. That test, not this ADR, is what stops the strip from migrating into `deleteDataset` later — but this ADR is why it is there.
