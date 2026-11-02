# Plan: loads write to a Load Buffer and merge

Implements [ADR 0071](../adr/0071-loads-write-to-a-load-buffer-and-merge-so-datasets-stay-published.md). Everything ships in one PR. The phases are its commits, in order, and each one builds and passes the tests. Phases 3 and 4 depend on 2, and phase 5 needs 3 and 4. See [Deploy](#deploy) for data that has to be dealt with when the PR goes out.

```text
1 Read-only raster mappings + remove a loaded raster File
2 Load Buffer infrastructure
3 Raster Load through the buffer ──┐
4 Bulk Load through the buffer  ───┴─> 5 Stop hiding Datasets, UI, docs
```

Paths are relative to `backend/` unless they start with `frontend/` or `docs/`.

---

## Phase 1: Read-only raster mappings, and removing loaded Files

This removes the edit machinery, and with it ADR 0059's "a failed load removes the layers of edited, published Files", before any buffer exists.

**Refuse edits**

- `src/services/DatasetFileMappingService.ts` `updateMapping`: drop the `is_raster` branch, so a content change to any loaded File returns 409. Reword the message so it no longer mentions staged data, and point raster users to remove the File and upload it again.
- `frontend/src/hooks/useRasterMappingStep.ts`: show loaded raster Files read-only, as the vector preview step does (`useDatasetPreviewStep`). Leave them out of `save()` and `isMappingChanged` too, so a save never posts a fresh data mapping for them and can't hit the 409.

**Only Files not yet loaded go through the steps**

Today every incremental vector load re-ingests the Files already loaded: `useMappingsStep.handleContinue` saves the mapping onto every Dataset File Mapping and queues `file-to-db` for each, and `fileToDB` puts a LOADED File back to STAGED. Under the Merge that would make every Merge cover the whole Dataset.

- `frontend/src/hooks/useDatasetIngestionState.ts`: work out `pendingFileMappings`, the mappings whose File is not LOADED. Compute `allFilesStaged` over them only.
- `frontend/src/hooks/useMappingsStep.ts`: `save()` updates only `pendingFileMappings`, and `handleContinue` queues `file-to-db` only for them. A loaded File keeps the mapping it was loaded with, so changing the column mapping for new Files no longer returns 409.
- `frontend/src/hooks/useRasterMappingStep.ts`: `handleContinue` queues no `raster-load` when no File is PENDING.
- `src/services/FileService.ts` `fileToDB`:
  - refuses a LOADED File with a new `FTD_FILE_ALREADY_LOADED`;
  - refuses while the File's Dataset has an `active` `bulk-load`, with a new `FTD_DATASET_LOADING`. Otherwise it would recreate a raw table the load is reading into its buffer, and the row-count check can't catch that, since the loader counts what it wrote. `file-to-db` stays out of the Dataset locks (ADR 0042); this is a check in the job, not a lock.
  - Add both codes to `src/errors/jobErrorMessages.ts`.

**Remove a loaded raster File**

Removing a File in the soil-data step deletes its Dataset File Mapping and then soft-deletes the File (`useFileManagement.deleteFileAndMapping`). Raster reads already hide a soft-deleted File's layers (`files.deleted_at IS NULL`, ADR 0008), but its rows stay, so `n_raster_layers`, footprints, groups and DAI go stale. Re-adding means uploading the File again.

- New `removeLoadedRasterFile(em, datasetId, fileId)` in `src/services/DatasetFileMappingService.ts`. When the File is raster and has Raster Layers in this Dataset, in one transaction:
  1. `DELETE FROM raster_layers WHERE file_id = $1 AND dataset_id = $2`. Footprint links, assets and group memberships go by cascade, and the orphan-footprint trigger removes unused footprints.
  2. `updateRasterDatasetMetadata` with the Dataset's current status.

  After commit: `refreshDaiStats` and `bumpCacheEpoch`.
- Call it from `deleteDataMappingByFileId` before deleting the mapping, and from `FileService.deleteFile` before the soft delete, for every Dataset the File is mapped to. It does nothing when there are no layers, so whichever request comes second is a no-op. Both routes check `assertEditable`, so both are refused while a load is queued or running.
- **Frontend:** `frontend/src/hooks/useDatasetsSoilData.ts` asks for confirmation before removing a loaded raster File of a LOADED or PUBLISHED Dataset. The removal is applied on save, including "save and continue later", and its layers leave a published Dataset straight away.

**Loaded vector Files can't be removed**

- `deleteDataMappingByFileId` and `FileService.deleteFile` refuse a loaded vector File with 409. Its observations do not record their source File, so it cannot be removed without a bulk delete of the Dataset.
- `frontend/src/hooks/useDatasetsSoilData.ts`: `removeFile` offers no removal for a loaded vector File (no remove button, or a disabled one with the reason), and `clearAll` leaves them in place. Otherwise the 409 would leave the File in `pendingRemovalIds`, hidden from the list, and every save would retry it and fail, blocking Continue, Previous and "save and continue later" until a reload.
- Raster Files keep their remove action, since removing is how a raster mapping is corrected.

**Docs**

- `src/openapi.yaml`: describe the new effects on `DELETE /datasets/{datasetId}/dataset-file-mapping` and `DELETE /files/{fileId}`.
- `docs/data-model/1b-raster-data-ingestion.md`: replace "Loading again: … edited mappings" with remove-and-upload-again.
- `CONTEXT.md` **Raster Load**: drop "the file can no longer be normalized again from its original pixels". Nothing re-normalizes a loaded File any more.

**Delete the edit machinery** (`src/jobs/raster-load/RasterLoader.ts`)

- `planMode`, `LoadMode`, `FilePlan.mode`, `forceCog`, `removedBands`, `updateRasterLayer`, and the update and removed-band loops in `processRasterLoad`.
- `loaded_bands`: stop writing it, and remove `LoadedRasterBand` and `toLoadedBand` from `src/interfaces/File.ts`.
- `RasterFormatCheckOptions.forceCog` and `FormatDeviations.rebuildOverviews` in `src/services/RasterIngestService.ts`.
- The empty-mapping case that removes a File's layers: an empty mapping on a never-loaded File still just skips it.
- Keep `resolveSourceFile` and `resetToSourceFile` until phase 3, since a retry of a failed first load still relies on them.

**Tests**

- `tests/services/DatasetFileMappingService*.test.ts` / route tests: 409 on a raster content change; same content still accepted.
- Removing a loaded vector File returns 409 from both delete routes, and its mapping, File and observations remain. Removing a vector File that isn't loaded yet still works.
- Removing a loaded raster File, through either delete route first:
  - deletes its layers, assets and footprint links;
  - keeps footprints another layer shares;
  - updates `n_raster_layers` and the bbox;
  - leaves the Dataset PUBLISHED;
  - the second route's call is a no-op.
- `fileToDB` fails a LOADED File with `FTD_FILE_ALREADY_LOADED` and leaves it LOADED, and fails with `FTD_DATASET_LOADING` while a `bulk-load` for its Dataset is active.
- Frontend:
  - `useMappingsStep`: with one LOADED and one new File, Continue updates and queues `file-to-db` for the new File only.
  - `useRasterMappingStep`: no `raster-load` is queued when nothing is PENDING, and `save()` posts no mapping for a loaded File.
  - `useDatasetsSoilData`: a loaded vector File has no remove action and survives `clearAll`, and removing a loaded raster File asks for confirmation.
- `tests/jobs/raster-load/RasterLoader.test.ts`: delete the edit tests (`loading into a loaded or published dataset` cases that remap, `is_categorical` flips, conversion edits, `lost-source`, `legacy_upload`). Keep the new-File-into-published-Dataset cases.

---

## Phase 2: Load Buffer infrastructure

**Migration** `src/migrations/<ts>-LoadBufferTemplates.ts`: `UNLOGGED` template tables, never written to directly.

```text
load_buffer_observations_template(
  record_id text,                        -- raw table cursor, for error messages
  geom geometry, geom_hash text,         -- features key; same expression as features.geom_hash
  license_name text,                     -- resolved by name or full_name in the Merge
  sampling_date text, min_depth int, max_depth int, horizon <same type as layers.horizon>,
  soil_property_id uuid, procedure_id uuid, value numeric)

load_buffer_raster_layers_template(
  file_id uuid, band int, soil_property_id uuid, procedure_id uuid,
  resolution_m int, nodata_value int, bbox geometry,
  min_depth int, max_depth int, reference_period_start text, reference_period_stop text,
  description text, is_categorical boolean)

load_buffer_raster_footprints_template(
  file_id uuid, band int, geom geometry(MultiPolygon,4326), geom_hash text)

load_buffer_raster_assets_template(file_id uuid, band int, asset_file_id uuid)

load_buffer_files_template(            -- what the Merge writes to files
  file_id uuid, file_path text, source_file_path text, unit_conversion_applied boolean)
```

Copy column types from the real tables in `1775600000000-CreateSchema.ts` and later migrations rather than retyping them. The templates have no indexes: `LIKE … INCLUDING ALL` would copy them, and indexes slow down filling the buffer. `prepareForMerge` builds them instead.

**Module** `src/data-layer/LoadBuffer.ts`

- `loadBufferId(jobId)`: the pg-boss job id without dashes; table names are `load_buffer_<kind>_<id>`.
- `createLoadBuffer(em, jobId, kinds)`: `CREATE UNLOGGED TABLE … (LIKE <template> INCLUDING ALL)` per kind.
- `dropLoadBuffer(em, jobId)`: `DROP TABLE IF EXISTS` per kind.
- `sweepLoadBuffers(em)`:
  1. List `load_buffer_%` tables.
  2. Drop those whose job is not `active` in pg-boss's job table.
  3. Delete the converted COGs those loads left: read them from the buffer's files table before dropping it.
- `MERGE_LOCK = { raster: <const>, vector: <const> }` for `pg_advisory_xact_lock`.
- `BufferCounts`: rows written per kind. The buffering functions add to it as they insert, and the loader keeps it in memory for the whole job.
- `prepareForMerge(em, jobId, kinds)`, run after the buffer is full and before the Merge's transaction:
  - creates the natural-key indexes per kind: `geom_hash` and the layer columns for observations, `(file_id, band)` and `geom_hash` for raster footprints, `(file_id, band)` for raster assets;
  - runs `ANALYZE` on each buffer table. Autovacuum won't have gathered statistics on a table that's minutes old, and without them the planner may choose nested loops for the natural-key joins.
- `assertBufferComplete(em, jobId, counts)`: the first statement in each Merge. It compares `count(*)` per buffer table with `BufferCounts`, and throws `LOAD_BUFFER_INCOMPLETE` on a mismatch.
  - This catches a Postgres crash restart, which truncates unlogged tables, and a failover, which leaves them empty on the new primary. Either way the worker's pool reconnects and keeps inserting, and without this check the Merge would commit part of the load.
  - Add `LOAD_BUFFER_INCOMPLETE` to `src/errors/jobErrorMessages.ts`, with a message saying the load was interrupted and should be run again.
- `MERGE_SETTINGS`: the `SET LOCAL` values each Merge applies, `statement_timeout` and `work_mem`, both taken from [Measure first](#measure-first).

**Wiring**

- `sweepLoadBuffers` runs at the start of `processBulkLoad` and `processRasterLoad`, and on a pg-boss schedule in `src/services/PgBoss.ts`. With `heartbeatSeconds: 300`, a dead worker's job leaves `active` within about 5 minutes, so the sweeper never drops a live load's buffer.

**Tests** `tests/data-layer/LoadBuffer.test.ts`

- Create and drop.
- `prepareForMerge` creates the indexes, and `pg_stats` has rows for the buffer tables afterwards.
- `assertBufferComplete` passes when counts match, and throws `LOAD_BUFFER_INCOMPLETE` after the buffer is `TRUNCATE`d, which is what a crash restart does to it.
- The sweeper drops a buffer whose job is completed, failed or missing, and keeps one whose job is active.

---

## Phase 3: Raster Load through the buffer

**Normalization** (`src/services/RasterIngestService.ts`)

- `checkFileFormat` and `convertRasterFile`:
  - Return the converted key and the metadata patch instead of running `UPDATE files SET file_path …`.
  - The key stays `<base>_cog.tif`: no published layer reads a never-loaded File, so overwriting it on a retry is safe.
- `processRasterLoad` writes the result to `load_buffer_files_<id>`.
- With the File no longer repointed during a load, `files.file_path` is the upload until the Merge. Remove:
  - `resolveSourceFile`, `legacySourceCandidates`, `resetToSourceFile`;
  - `RL_SOURCE_FILE_NOT_FOUND` from `src/errors/jobErrorMessages.ts`;
  - the `alreadyUnitConverted` guard in `checkFileFormat`.

**Ingest into the buffer**

- `ingestRaster` becomes `bufferRasterBand(opts, { jobId, filePath })`:
  - `filePath`: the converted key from normalization, or the upload when nothing was converted.
  - **Layer row:** resolve the soil property and procedure slugs to ids, still failing on an unknown slug, and insert one row into `load_buffer_raster_layers_<id>`.
  - **Footprints:** `insertFootprintBatch` inserts into `load_buffer_raster_footprints_<id>`, keeping the `ST_MakeValid`, `ST_CollectionExtract` and `ST_Subdivide` work and computing `geom_hash` there. The Merge then does no geometry work.
  - **Connections:** the dedicated `queryRunner` and its `statement_timeout` stay, with no transaction open.
- Assets: `resolveAdditionalResources` is unchanged, and its result goes into `load_buffer_raster_assets_<id>`. `syncRasterLayerAssets` is no longer called by the loader.

**Merge** `src/jobs/raster-load/RasterMerge.ts`, called at the end of `processRasterLoad`

```text
prepareForMerge(layers, footprints, assets, files)
BEGIN
  SET LOCAL statement_timeout, work_mem   (MERGE_SETTINGS)
  pg_advisory_xact_lock(MERGE_LOCK.raster)
  assertBufferComplete(counts)
  INSERT raster_layers (…, dataset_id) SELECT … FROM buffer_layers RETURNING id, file_id, band
  INSERT raster_footprints (geom) SELECT DISTINCT ON (geom_hash) … ON CONFLICT (geom_hash) DO NOTHING
  INSERT raster_layer_footprints SELECT layer.id, rf.id
      FROM buffer_footprints bf JOIN raster_footprints rf USING (geom_hash) JOIN <inserted layers> USING (file_id, band)
  INSERT raster_layer_assets SELECT … FROM buffer_assets JOIN <inserted layers>
  UPDATE files SET status = LOADED, file_path = COALESCE(bf.file_path, files.file_path),
                   metadata = metadata || source_file_path / unit_conversion_applied
      FROM buffer_files bf …   (plus files with nothing converted)
  updateRasterDatasetMetadata(em, datasetId, current status: PUBLISHED stays, else LOADED, updatedBy)
COMMIT
refreshDaiStats; bumpCacheEpoch
deleteSourceFiles (if delete_source_files)
dropLoadBuffer
```

- Raster Layer groups are recomputed by the statement-level `trg_refresh_raster_layer_groups_ins` trigger (ADR 0046). Insert all of a load's footprint links in one statement, so groups are recomputed once per Merge. Include that recompute in the Merge timing below.
- `processRasterLoad`:
  - Remove `hideDatasetForLoad`, `touchedFileIds` and the catch's layer deletion and status restore.
  - The catch becomes: delete the COGs listed in `load_buffer_files_<id>`, `dropLoadBuffer`, rethrow.
  - With no PENDING File, return before creating a buffer: no Merge, no metadata write, no DAI refresh. The frontend no longer queues such a job, but the API still accepts it.
  - `ErrorService.clearDatasetErrors` stays.

**Tests** (`tests/jobs/raster-load/RasterLoader.test.ts`)

- Update the conversion tests: `file_path` is repointed only after the load completes.
- A PUBLISHED Dataset stays PUBLISHED during the load. Spy on `bufferRasterBand` and query mid-load: `/soil-data` and coverage return the old layers only, and `n_raster_layers` is unchanged.
- Failure after normalization: the File still points at its upload, the converted COG is deleted, there are no new layers, and the status is unchanged.
- Failure inside the Merge (for example, mock `updateRasterDatasetMetadata` to reject): nothing new is visible, and the buffer is dropped.
- A footprint shared with another Dataset's layer is reused, not duplicated.
- Two concurrent Merges (two Datasets) both succeed; the second waits on the lock.
- Buffer truncated mid-load (`TRUNCATE` from the `bufferRasterBand` spy): the load fails with `LOAD_BUFFER_INCOMPLETE`, there are no new layers, and the Files stay PENDING.
- Retry after a failure starts from the upload and scales once.

---

## Phase 4: Bulk Load through the buffer

**Write path** (`src/data-layer/VectorDataLoad.ts`)

- Split `rawRecordToDataModel` into:
  - `bufferRecords(em, jobId, mapping, records)`:
    - Keep the per-record sanitizing, class checks and value filter, so validation errors fail the batch as today.
    - Write one buffer row per (record, mapped property) with a single `INSERT … SELECT FROM unnest(…)` per batch.
  - `mergeVectorBuffer(em, jobId, datasetId)`:

    ```text
    INSERT licenses (name)  buffered names matching no licenses.name or .full_name   ON CONFLICT DO NOTHING
    INSERT features (geom)  DISTINCT ON (geom_hash)                                  ON CONFLICT (geom_hash) DO NOTHING
    INSERT layers (license, sampling_date, min_depth, max_depth, horizon)  DISTINCT  ON CONFLICT ON CONSTRAINT UQ_layers_… DO NOTHING
    INSERT dataset_layers (dataset_id, layer_id, feature_id, soil_property_id)
        SELECT DISTINCT … JOIN features USING (geom_hash)
                          JOIN layers ON each column IS NOT DISTINCT FROM          ON CONFLICT DO NOTHING
    INSERT observations (dataset_layer_id, value, procedure_id)
        SELECT … JOIN dataset_layers                                                ON CONFLICT ON CONSTRAINT UQ_observations_… DO NOTHING
    ```

    Licence resolution must match `rawRecordToDataModel`: an existing licence found by `name` or `full_name`, else a new one by `name`.
- Delete `rawRecordToDataModel` once both callers are moved.

**Bulk Load** (`src/jobs/bulk-load/BulkLoader.ts`)

- `processFile`:
  - Keeps paging the raw table with `vdl.getDataPreview(…, includeUserDropped = false, cursor)`; its rows are `bufferRecords`' input. Call `VectorDataLoad` directly, not `DatasetService.getSoilData`, which swaps class codes for labels.
  - Calls `bufferRecords` directly in batches, instead of `makeRequest` over the loopback HTTP endpoint.
  - `parseWriteError` maps buffer and validation errors to the same `BL_*` codes.
  - Remove `makeRequest` and the `INTERNAL_REQUEST_TOKEN_PAYLOAD` use.
- Cleaning stats (`getSoilDataStats`) still run per File before the Merge.
- `prepareForMerge`, then the Merge transaction:
  1. `MERGE_SETTINGS`;
  2. advisory lock;
  3. `assertBufferComplete`;
  4. `mergeVectorBuffer`;
  5. Files to LOADED;
  6. `processing_steps.cleaning_steps`;
  7. `updateDatasetMetadata` with PUBLISHED staying PUBLISHED, else LOADED.
- After commit: drop raw tables, `delete_source_files`, `refreshDaiStats`, `bumpCacheEpoch`, `dropLoadBuffer`. Raw tables are dropped after the Merge, so a failed load can be retried.
- Catch: `dropLoadBuffer`, rethrow. The Dataset keeps its status; Files stay STAGED.

**Direct writes** (`src/controllers/datasets.ts` `postSoilData`)

- Inside the request transaction: create a buffer named after a fresh UUID, call `bufferRecords` and then `mergeVectorBuffer`, and drop the buffer. Then `refreshDaiStats` and `bumpCacheEpoch` as today.
  - Skip `prepareForMerge` and `assertBufferComplete` here. A request's batch is small enough to join without indexes, and a crash aborts the whole transaction, so the buffer can't be emptied partway through.
- Remove the `isInternalRequest` lock bypass once nothing sends internal requests (check other callers first).

**Tests**

- **Parity suite**, written first: `tests/data-layer/VectorDataLoad.parity.test.ts`. Load the same fixtures through `rawRecordToDataModel` (kept in the test only, or checked out from git history) and through buffer-and-Merge, then compare `features`, `layers`, `licenses`, `dataset_layers` and `observations` row for row. Cover:
  - null `sampling_date`, depths and `horizon`;
  - a licence matched by `full_name`;
  - a new licence;
  - a geometry already used by another Dataset;
  - the same record twice in one File;
  - two Files in one load sharing features;
  - class-coded values.
- `tests/jobs/bulk-load/BulkLoader.test.ts`:
  - a PUBLISHED Dataset stays PUBLISHED during the load, and mid-load reads return old data only;
  - a failed load leaves the status, Files STAGED, raw tables present, and no new shared rows;
  - a buffer truncated mid-load fails with `LOAD_BUFFER_INCOMPLETE` and the same outcome;
  - a retry succeeds.
- `postSoilData` route tests are unchanged.

---

## Phase 5: Stop hiding Datasets, UI and docs

- Remove `hideDatasetForLoad`, `statusAfterLoad`, `statusAfterFailedLoad` (`src/jobs/LoadStatus.ts`) and their tests, if phases 3 and 4 haven't already.
- No Dataset is set ONGOING any more. Keep `IngestionStatus.ONGOING`, since `file-to-db` still sets it on Files (`src/services/FileService.ts`, read by `frontend/src/hooks/useDatasetIngestionState.ts`).
- **Loading from the job (backend):**
  - Next to `queued_job`, expose `active_job: { id, queue } | null`: the `active` `bulk-load` or `raster-load` job whose `data.dataset_id` is the Dataset's slug.
  - Use the same lookup and the same Privileged-only rule as `queued_job`, and add it to `src/openapi.yaml`.
  - `bulk-delete` is left out: it soft-deletes the Dataset, which then leaves the list.
- **Loading from the job (frontend):**
  - `frontend/src/types/backend.ts`: add `active_job`.
  - `frontend/src/hooks/useDatasetsPublicationList.ts`: add `isLoading: Boolean(dataset.active_job)` next to `isQueued`, and add `isLoading` to `frontend/src/types/datasetsPublication.ts`.
  - `DatasetsTableStatusTemplate.tsx`: the tag is `QUEUED` if queued, else `ONGOING` (the existing Loading label and style) if loading, else the status.
  - `DatasetsPublicationTable.tsx`: the sort uses the ONGOING rank for `isLoading`. The LOADED row highlight requires `!isLoading` too.
  - `DatasetsTableActionTemplate.tsx`: no actions while loading, as while queued.
  - Remove the `ONGOING` entry from `statusSortingMap` once nothing gives it a Dataset.
- **Adding Files to a loaded or published Dataset (frontend):** today there is no way in. Edit on a PUBLISHED Dataset always goes to settings, the settings page doesn't link to the steps, and a LOADED Dataset has no Edit action. The only route is typing `/edit/<id>/soil-data`.
  - `DatasetsTableActionTemplate.tsx`: an **Add files** action on LOADED and PUBLISHED rows that goes to `/edit/<id>/soil-data`. Hidden while Queued or Loading, like the other actions.
  - `DatasetsSettingsPage.tsx`: the same action, for a Dataset opened through Edit.
  - Add the label to the `admin` locale files.
- **`DatasetsEditRedirect.tsx`:**
  - A Loading Dataset goes back to the list: every save would return 409.
  - A LOADED Dataset with no File waiting for a load goes to `soil-data` instead of its `furthestStep`. `furthestStep` stays at `preview` after a load, and that preview would have nothing to show. Deciding this in the redirect, rather than resetting the stored step when the load ends, also works when the page wasn't open at the time.
  - PUBLISHED still goes to settings.
- **Tests:**
  - `active_job` is set while a load runs and cleared when it completes, fails or is reaped.
  - A PUBLISHED Dataset mid-load shows Loading with no actions, then Published when the load ends.
  - Add files is shown for LOADED and PUBLISHED rows only, and opens `soil-data`.
  - The redirect sends a Loading Dataset to the list, and a LOADED one with nothing waiting to `soil-data`.
- **Docs:**
  - `docs/data-model/1b-raster-data-ingestion.md`:
    - remove "the dataset is hidden" and "Loading again: … edited mappings";
    - document remove-and-re-add;
    - rewrite "When a Load Fails": nothing is written until the load completes, and the Dataset keeps its status;
    - drop the `RL_SOURCE_FILE_NOT_FOUND` row.
  - `docs/data-model/1a-vector-data-ingestion.md`: remove "the dataset is hidden", and say a failed load leaves the Dataset as it was.
  - `docs/data-model/1-data-management-portal.md`: in the status table, **Loading** says a published Dataset stays live while it loads, and nothing can be edited meanwhile. Document the Add files action, and that only Files not yet loaded go through the mapping and preview steps.
  - `docs/adr/0042-…`: add an "Amended by ADR 0071" note. Loading is now derived the same way, and its consequence about a reaped load leaving ONGOING no longer holds.
  - `docs/backend/async.md`: update `bulk-load`, and add the missing `raster-load` section including `delete_source_files`.
- `CONTEXT.md`: drop "(proposed)" from **Load Buffer** and **Merge**, and add the relationship "a load's data becomes visible only when its **Merge** commits".
- Mark ADR 0071 Accepted, and change ADR 0059's amendment note to say those sections are superseded.

---

## Measure first

Before phase 3 merges, on a copy of production data:

- Rows added by the largest real Bulk Load (observations) and Raster Load (footprints). Time the Merge on each, and use that to set the Merge's `statement_timeout`.
- `work_mem` for the Merge: run it with `log_temp_files = 0`, and raise `work_mem` until its hash joins stop writing temporary files, or until the value gets too large for the instance's memory.
- How often loads on different Datasets overlap, to judge how long a Merge waits on the lock.
- **Disk:** the size of the largest load's buffer with its indexes (`pg_total_relation_size`), times the number of loads that can run at once, compared with free disk space on the database volume.
- **Cache:** the buffer cache hit ratio (`pg_stat_database.blks_hit / (blks_hit + blks_read)`), and catalog query latency, before, during and after the largest load.
  - If the hit ratio drops noticeably, fill the buffer with `COPY` instead of batched `INSERT`s. Postgres writes `COPY` through a small ring of buffers rather than the main cache, so it pushes out less published data.
  - `shared_buffers` itself needs no change: it doesn't limit a buffer's size.

## Deploy

Two kinds of rows written by the old code can't be handled by the new code, and need dealing with when the PR goes out:

- **Edited raster Files waiting for a load:** Files that are PENDING and already have Raster Layers. The new code has no edit path for them.
- **Datasets left ONGOING** by a worker that died mid-load under the old code.

The plan is to drain before deploying, and to have a migration catch anything left:

1. **Before deploying:** run this query, and run a Raster Load on every Dataset it lists, so pending edits are applied with the old code:

   ```sql
   SELECT DISTINCT rl.dataset_id
   FROM files f JOIN raster_layers rl ON rl.file_id = f.id AND rl.deleted_at IS NULL
   WHERE f.status = 'PENDING';
   ```

   Also list `SELECT id, name FROM datasets WHERE status = 'ONGOING' AND deleted_at IS NULL`, and decide each one by hand (publish it, or leave it LOADED).
2. **Migration in this PR**, as a safety net:
   - Raster Files still PENDING with layers go back to LOADED. Their pending edit is discarded, and the migration logs each one so an admin can remove and re-add the File.
   - Datasets still ONGOING become LOADED, the status a retry gives them today.
