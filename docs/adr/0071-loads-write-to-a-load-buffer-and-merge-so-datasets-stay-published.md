# Loads write to a Load Buffer and merge, so Datasets stay published

**Status:** Proposed. Supersedes parts of ADR 0059 (`datasets-support-incremental-ingestion`): how a raster edit is applied, the Dataset during a load, and when a load fails.

A Bulk Load or Raster Load no longer hides its Dataset. Everything it writes goes into a per-load **Load Buffer** that no read can see. One short **Merge** transaction then moves it into the real tables, so a published Dataset keeps serving its existing data for the whole load and its new data appears all at once. A loaded raster File's Band Mapping becomes read-only, as a loaded vector File's already is.

## Context

ADR 0059 hides the Dataset (status ONGOING) for the whole load, because every read filters on `datasets.status = 'PUBLISHED'` and that status was the only way to keep half-loaded data out of sight. That has three costs:

- A published Dataset disappears from the catalog, queries and the DAI rollup for as long as the load runs, including when only one File is being added.
- A worker that dies mid-load leaves the Dataset ONGOING. The previous status is not stored, so a retry ends it LOADED and someone has to publish it again.
- A failed Raster Load deletes the layers of every File it had started on. That includes published Files that only had their mapping edited, and they stay missing until a retry succeeds. A failed Bulk Load cannot be undone at all, so it leaves the Dataset PENDING.

Keeping the Dataset visible needs some other way to keep a load's rows out of reads until the load is complete. Two facts constrain the options:

- `features`, `layers`, `licenses` and `raster_footprints` are shared across Datasets and deduplicated by upsert on natural keys: `geom_hash`, `UNIQUE NULLS NOT DISTINCT (license, sampling_date, min_depth, max_depth, horizon)`, licence name, `geom_hash`. `dataset_layers` and `observations` are deduplicated within a Dataset, so a new File's observations can attach to a `dataset_layers` row that is already published.
- Raster pixels are read at query time through `files.file_path`. Re-normalizing an edited File rewrites the COG that its published layers read, and repoints `file_path` while the load runs.

## Decision

- **A loaded raster File's Band Mapping is read-only.**
  - `updateMapping` refuses a content change to any loaded File with 409, raster or vector.
  - A load therefore only ever touches Files that were never loaded, and no published layer reads from those Files.
  - The edit machinery goes: `loaded_bands`, update mode, `forceCog`, removed bands, `updateRasterLayer`, re-normalizing from `source_file_path`, and `RL_SOURCE_FILE_NOT_FOUND`.
- **Correcting a loaded raster File means removing it and uploading it again.**
  - Removing a File in the admin console deletes its Dataset File Mapping and soft-deletes the File. Whichever of the two comes first also deletes that File's Raster Layers. Their footprint links, assets and Raster Layer group memberships go with them by cascade.
  - That happens in one transaction, followed by the Dataset metadata rollup, the DAI refresh and the cache-epoch bump. The admin console asks for confirmation first, since the layers leave a published Dataset straight away.
  - The corrected File is uploaded again and loaded as a new one.
  - Raster Layer Assets are added or removed through the same remove-and-reload route; there is no separate assets endpoint.
- **A loaded vector File cannot be removed from its Dataset.** Deleting its Dataset File Mapping or the File is refused with 409, and the admin console offers no remove action for it. Its observations do not record their source File, so removing it would leave its data behind. A bulk delete of the Dataset is the only way to take it out.
- **Only Files not yet loaded go through the ingestion steps.**
  - The mapping step saves mappings and queues `file-to-db` only for those Files, and `file-to-db` refuses a LOADED File. Until now every vector load re-ingested the Files already loaded, which the upserts hid, but which would make every Merge cover the whole Dataset.
  - `file-to-db` also refuses while a Bulk Load of its Dataset is active, since it would recreate a raw table that load is reading.
  - A Raster Load with no PENDING File does nothing.
- **Loaded and published Datasets get an Add files action** that opens the soil-data step. Until now the only way to add Files to them was typing the step's URL.
- **A load writes only to its Load Buffer.**
  - The buffer is a set of `UNLOGGED` tables created for the load, named after its pg-boss job id, from templates shipped by a migration.
  - Rows carry natural keys rather than ids: geometry and `geom_hash`, licence name, the layer's metadata columns, soil property, procedure and value for vector data; File, Band, layer fields and subdivided footprint geometries for raster data.
  - All validation, cleaning, normalization and footprint tracing happen while the buffer is filled, outside any transaction.
  - The loader counts the rows it writes to each buffer table. Once the buffer is full, it builds the buffer's natural-key indexes and runs `ANALYZE`, so the Merge's joins are planned on real statistics.
- **Normalization never repoints a File during a load.**
  - The converted COG is written to storage, but `files.file_path`, `source_file_path` and `unit_conversion_applied` are written by the Merge.
  - Until then the File still points at its upload, so a retry starts from the original pixels without any source lookup.
- **The Merge is one transaction, serialized per loader by an advisory lock.**
  - It first checks that each buffer table holds as many rows as the loader counted, and fails the load if not. A crash restart of Postgres truncates unlogged tables, and a failover leaves them empty on the new primary, because they aren't replicated. A worker that reconnects and carries on would otherwise merge part of its load and mark its Files LOADED.
  - It inserts the shared rows with `ON CONFLICT DO NOTHING`, then the Dataset's rows, resolving ids by joining on the natural keys. Joins on nullable keys use `IS NOT DISTINCT FROM`, to match the `NULLS NOT DISTINCT` constraints.
  - Raster layers, footprint links and assets are plain inserts, since a File is only ever merged once.
  - The same transaction marks the Files LOADED and writes the Dataset metadata.
  - After commit: refresh the DAI rollup, bump the cache epoch, drop the Load Buffer, drop raw tables, and delete source files when asked to.
- **The Dataset's status is never changed by a load.** A PUBLISHED Dataset stays PUBLISHED; any other Dataset ends LOADED after a successful Merge and keeps its status after a failure. `hideDatasetForLoad`, `statusAfterLoad` and `statusAfterFailedLoad` are removed.
- **Loading is derived from the queue, as Queued is (ADR 0042).**
  - A Dataset is **Loading** while `pgboss.job` holds an `active` `bulk-load` or `raster-load` job for it. It is computed on read, exposed to Privileged callers next to `queued_job`, and never stored in `datasets.status`.
  - The admin console shows the Loading tag over the Dataset's real status, sorts it as ONGOING sorted, and offers no actions while it lasts. Edits would return 409 anyway.
  - Like Queued, Loading cannot get stuck: it ends when pg-boss moves the job out of `active`, including when it reaps a dead worker.
  - No Dataset holds ONGOING any more. The value stays in `IngestionStatus` for Files, which `file-to-db` still sets.
- **A failed or crashed load leaves no trace in the real tables.**
  - Failure before the Merge drops the Load Buffer.
  - Failure during the Merge rolls the transaction back.
  - A crashed worker's buffer, and any COG it converted, are removed by a sweeper that drops the buffers of jobs pg-boss no longer shows as active. The sweeper runs at the start of every load and on a schedule.
- **Direct writes to `POST …/soil-data` go through the same buffer-and-Merge path**, inside the request's transaction, so there is one deduplication implementation. The Bulk Load calls it directly rather than over the loopback HTTP endpoint.

## Considered options

- **Keep hiding the Dataset (ADR 0059):** rejected for the three costs above.
- **Keep the Dataset visible and accept partial visibility:** rejected, as in ADR 0059. A Raster Layer row is inserted before its footprints, and vector batches would appear one by one.
- **A staging Dataset: load under a hidden sibling Dataset row, then re-point `dataset_id` at the end.**
  - What it offered: it reuses today's write path almost unchanged.
  - Why it lost:
    - a failed load leaves orphaned shared `features` and `layers`;
    - admin listings have to hide the sibling Dataset;
    - a Merge has to re-point and deduplicate `dataset_layers` collisions.
  - It also needed `(file_id, band)` uniqueness to allow a second layer for edited Files. That point no longer applies now that edits are removed.
- **A row-level load marker on `raster_layers` and `observations`, filtered by every read:** rejected. Every read path would have to add the predicate, and missing one leaks half-loaded data. It also adds a predicate to the hottest scan.
- **The whole load in one database transaction:** rejected. `DO UPDATE` upserts on the shared tables would hold row locks for the whole load, so concurrent loads on other Datasets would block or deadlock. The transaction would also hold back vacuum database-wide, and GDAL work between statements risks `idle_in_transaction_session_timeout`.
- **`TEMP` tables for the buffer:** rejected. They belong to one session, while a load spreads its queries across pooled connections, and a failed load's buffer could not be inspected.
- **One permanent buffer table keyed by `load_id`:** rejected. Cleanup would be a `DELETE` of millions of rows, which bloats the table; dropping a per-load table is instant.
- **Keep raster edits and handle them in the Merge** (upsert by `(file_id, band)`, reconcile footprint links, delete unmapped bands, per-load COG keys swapped at the Merge): rejected. It was the largest and riskiest part of the change, and it served a correction path that remove-and-reload covers.

## Consequences

- A published Dataset never leaves the catalog during a load. Its new data, metadata and DAI rollup change together at commit.
- A failed or crashed load leaves the Dataset with its status and data exactly as before. Both loaders now handle failure the same way, closing ADR 0059's "Bulk load leaves the Dataset PENDING".
- Fixing a loaded raster File's mapping costs a full reload of that File (normalization and footprint pass), where ADR 0059 updated layer metadata in place. The reloaded layers get new ids. Raster Layer groups are derived by trigger from footprint links (ADR 0046), so they follow without any extra step.
- Adding Files to a vector Dataset now costs what loading those Files costs, as ADR 0059 intended. The column mapping can be changed for new Files, while loaded Files keep the one they were loaded with.
- A loaded File's mapping is read-only for every data type. A wrong vector mapping can only be fixed by a bulk delete and a full reload of the Dataset, until observations record their source File.
- `delete_source_files` is safe for raster: nothing ever needs a File's original pixels after its Merge.
- The Merge's duration grows with the rows a load adds. Merges of one loader queue behind each other, and the Merge sets its own `statement_timeout` above the pool's 20 s default, and its own `work_mem` so its hash joins don't spill to disk.
- A load's buffer takes disk space about the size of the rows it adds, plus its indexes, until the Merge drops it. Concurrent loads add up.
- `shared_buffers` doesn't limit a buffer's size: unlogged tables are ordinary tables that skip the WAL, and their pages are evicted like any other. A large load can push published data out of the cache for a while, which is measured before the change ships.
- A database crash or failover during a load fails that load at the Merge, and the retry starts from scratch.
- The Merge's SQL is now the only place shared rows are deduplicated. A mismatch with the constraints creates duplicate `features`, `layers` or `licenses` rows, so it is covered by tests that compare it with the previous write path.
- ADR 0042's consequence "a reaped load still leaves `status = 'ONGOING'`" no longer holds.
- Datasets left ONGOING by the old code are moved to LOADED by a migration when this ships.
