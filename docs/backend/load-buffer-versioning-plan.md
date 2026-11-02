# Plan (alternative): versioned loads on the Load Buffer

An alternative to [load-buffer-plan.md](load-buffer-plan.md), for option 4A: adding data to a published Dataset opens a **pending version**. Only the new Files are loaded, into a Load Buffer. The buffer is merged into the Dataset when an admin publishes the version, not when the load ends. Until then the published data is untouched and the new data can be reviewed, fixed per File, or discarded.

Paths are relative to `backend/` unless they start with `frontend/` or `docs/`. Everything ships in one PR; the phases are its commits, in order.

```text
1 Read-only raster mappings, removals, Files not yet loaded only     (as load-buffer-plan.md phase 1)
2 Load Buffer infrastructure, keyed by version, durable after load
3 Dataset versions: model, routes, publish and discard jobs
4 Raster Load into the buffer ──┐
5 Bulk Load into the buffer  ───┴─> 6 Review, UI and docs
```

## Scope decisions

- **Versions only for PUBLISHED Datasets.**
  - A Dataset that has never been published merges at the end of each load, as in [load-buffer-plan.md](load-buffer-plan.md). Its status already hides its data, admins already review it in the app as a LOADED Dataset, and Publish stays the status change it is today.
  - Adding data to a PUBLISHED Dataset opens a version.
- **One open version per Dataset.** Its number is the Dataset's current version + 1.
- **The version keeps the Dataset's identity.** Publishing merges into the same `datasets` row; the id, slug, access list, data requests and settings carry over. There are no archived copies and no rollback.
- **Settings aren't stored on the version.** The publish request carries the publication settings, and the settings page pre-fills them from the Dataset's current ones. Editing the Dataset's settings while a version is open stays allowed.
- **The buffer is `UNLOGGED` while it fills, then `SET LOGGED`.** The load keeps the fast writes, and a version waiting days to be published survives a crash. Later loads into the same open version write to the already-logged buffer.
- **Publishing is a job.** The Merge can outlast an HTTP request, so it runs as a pg-boss job on a Dataset-locking queue.
- **Direct `POST …/soil-data` writes** are unaffected: they merge straight away through a transient buffer, as in [load-buffer-plan.md](load-buffer-plan.md) phase 4.

---

## Phase 1: as load-buffer-plan.md phase 1

Unchanged: read-only raster mappings, removing loaded raster Files, refusing removal of loaded vector Files, and only Files not yet loaded going through the steps.

One change: "loaded" in those rules means **loaded into the published data**, meaning `dataset_file_mappings.version_id IS NULL` (phase 3). A File loaded into an open version can still be remapped, removed and reloaded (phase 3, **Fix a File**).

---

## Phase 2: Load Buffer infrastructure

As [load-buffer-plan.md](load-buffer-plan.md) phase 2, with these changes:

- **Naming:** buffers are `load_buffer_<kind>_<bufferId>`. `bufferId` is the version id for a versioned load, and the job id for a load that merges straight away (a Dataset not yet published).
- **Templates:** every template carries `file_id uuid`, including `load_buffer_observations_template`, so one File's rows can be deleted from a version. The Merge ignores it.
- **`createLoadBuffer`** creates the tables `UNLOGGED`, or reuses them when they already exist for an open version.
- **New `persistLoadBuffer(em, bufferId, kinds)`:** `ALTER TABLE … SET LOGGED` per kind. It runs once, at the end of a version's first load, after `assertBufferComplete`. It rewrites the table and writes it to the WAL once.
- **New `deleteBufferedFile(em, bufferId, fileId)`:** `DELETE … WHERE file_id = $1` per kind, and deletes the File's converted COG.
- **`sweepLoadBuffers`:**
  - drops a job-keyed buffer whose job isn't active, as before;
  - drops a version-keyed buffer only when its version is DISCARDED or PUBLISHED, or no longer exists.
  - A failed load into an open version deletes its Files' rows itself (phase 4 and 5) and leaves the buffer.
- **Row counts:**
  - `BufferCounts` are stored per version and kind in `dataset_versions.buffer_counts` (phase 3), which is logged.
  - `assertBufferComplete` runs at the end of each load, before `persistLoadBuffer`, and again at the start of the publish Merge.
  - A crash while a load fills the `UNLOGGED` buffer fails that load at the end-of-load check.

**Tests:** as before, plus:
- `persistLoadBuffer` makes the tables logged (`pg_class.relpersistence = 'p'`);
- `deleteBufferedFile` removes only that File's rows;
- the sweeper keeps an open version's buffer when no job is active.

---

## Phase 3: Dataset versions

**Migration** `src/migrations/<ts>-DatasetVersions.ts`

```text
datasets.version int NOT NULL DEFAULT 1

dataset_versions(
  id uuid PK, dataset_id uuid FK datasets ON DELETE CASCADE,
  number int NOT NULL,
  status text NOT NULL,               -- OPEN | LOADED | PUBLISHED | DISCARDED
  buffer_counts jsonb NOT NULL DEFAULT '{}',
  created_by text, created_at, updated_at, published_at, published_by)
UNIQUE (dataset_id) WHERE status IN ('OPEN', 'LOADED')        -- one open version per Dataset

dataset_file_mappings.version_id uuid NULL FK dataset_versions   -- NULL: part of the published data
```

**Entity and service** `src/entities/DatasetVersion.ts`, `src/services/DatasetVersionService.ts`

- `openVersion(datasetSlug)`:
  - refused unless the Dataset is PUBLISHED and has no open version;
  - checks `assertEditable`;
  - creates the version as OPEN, with `number = datasets.version + 1`.
- `getOpenVersion(datasetSlug)`.
- `createMapping` (`DatasetFileMappingService`): a new File mapped to a Dataset with an open version gets `version_id` = that version.
- **Fix a File** in an open version:
  - remap, remove or reload it: `deleteBufferedFile`, then the File goes back to STAGED (vector) or PENDING (raster), and it can be mapped and loaded again;
  - the read-only and no-removal rules from phase 1 don't apply while `version_id` is set;
  - the vector raw table is kept until publish, so a vector File can be reloaded without `file-to-db`.

**Routes** (`src/openapi.yaml`, `src/controllers/datasets.ts`), all Privileged, all through `assertEditable`:

| Route | Does |
|---|---|
| `POST /datasets/{id}/versions` | `openVersion` |
| `GET /datasets/{id}/versions/open` | the open version, with its Files and buffer counts |
| `POST /datasets/{id}/versions/{versionId}/publish` | body: the publication settings. Validates them like today's publish, then queues `version-publish` |
| `DELETE /datasets/{id}/versions/{versionId}` | queues `version-discard` |

**Jobs** (`src/jobs/version/`, registered in `src/services/PgBoss.ts`)

Add `version-publish` and `version-discard` to `DATASET_LOCKING_QUEUES` (`src/data-layer/DatasetJobs.ts`), so nothing else runs on the Dataset meanwhile.

`version-publish`:

```text
prepareForMerge(buffer)
BEGIN
  SET LOCAL statement_timeout, work_mem   (MERGE_SETTINGS)
  pg_advisory_xact_lock(MERGE_LOCK.vector | raster)
  assertBufferComplete(buffer, version.buffer_counts)
  mergeVectorBuffer | RasterMerge                    (load-buffer-plan.md phases 3 and 4)
  dataset_file_mappings SET version_id = NULL WHERE version_id = v
  files: LOADED, file_path / source_file_path / unit_conversion_applied from buffer_files
  datasets: publication settings from the job, version = v.number, metadata rollup
  dataset_versions: PUBLISHED, published_at, published_by
COMMIT
refreshDaiStats; bumpCacheEpoch; drop raw tables; delete source files (if asked); dropLoadBuffer
```

A failure rolls back and leaves the version LOADED, so publishing can be tried again.

`version-discard`:
- deletes the version's COGs and Files, and their mappings (soft delete, as `deleteFileAndMapping` does);
- drops the raw tables and the buffer;
- marks the version DISCARDED.

**Loading:** `active_job` (load-buffer-plan.md phase 5) covers `version-publish` and `version-discard` too, so the admin console shows the Dataset as busy while they run.

**Tests** `tests/services/DatasetVersionService.test.ts`, `tests/jobs/version/*.test.ts`

- A second open version is refused. A version can't be opened on a Dataset that isn't PUBLISHED.
- A new File added while a version is open gets its `version_id`.
- Publish:
  - the published data gains exactly the buffered rows, with no duplicate shared rows;
  - the settings are applied, `datasets.version` is incremented, and the buffer is dropped;
  - mid-publish reads return the old data only.
- Publish failure (mock `updateDatasetMetadata` to reject): nothing changes, the version stays LOADED, and a retry succeeds.
- A buffer truncated while the version waits fails publish with `LOAD_BUFFER_INCOMPLETE`, and the version stays LOADED.
- Discard: the buffer and the version's Files go, and the published data is unchanged.
- Fix a File: deleting one File's rows and reloading it changes only that File's rows.

---

## Phase 4: Raster Load into the buffer

As [load-buffer-plan.md](load-buffer-plan.md) phase 3, except where the load ends:

- **Dataset not yet published:** create a job-keyed buffer, fill it, and Merge at the end, as in that plan.
- **Dataset with an open version:**
  1. Fill the version's buffer, for the version's PENDING Files only.
  2. At the end: `assertBufferComplete`, add the counts to `buffer_counts`, then `persistLoadBuffer` on the first load.
  3. The Files are marked LOADED and the version LOADED.
  4. No Merge, no metadata write, no DAI refresh.
  5. Normalization writes the converted key to `load_buffer_files_<v>`; `files.file_path` is repointed at publish.
- **A PUBLISHED Dataset with no open version:** refused with 409. A load needs a version to write to.
- **Failure:**
  - job-keyed buffer: drop it;
  - version: `deleteBufferedFile` for each File this load touched, then those Files go back to PENDING. Earlier loads' rows stay.

**Tests:** as in that plan, plus:
- a load into a version leaves the published layers and metadata untouched, and the version ends LOADED;
- a second load into the same version adds to its buffer;
- a failed second load keeps the first load's rows.

---

## Phase 5: Bulk Load into the buffer

As [load-buffer-plan.md](load-buffer-plan.md) phase 4, with the same split between versioned and non-versioned loads:

- **Not yet published:** Merge at the end.
- **Open version:** fill the version's buffer, then count check, `persistLoadBuffer`, Files LOADED and the version LOADED.
  - Raw tables are **not** dropped: they're needed to reload a File, and are dropped at publish or discard.
  - The cleaning stats are written into the version's `processing_steps` at publish, not straight away.
- **Failure into a version:** `deleteBufferedFile` for each File this load touched, and those Files stay STAGED.
- `bufferRecords` writes `file_id` on every row.
- The parity suite is unchanged, and still comes first.

---

## Phase 6: Review, UI and docs

**Review endpoints** (Privileged, read the version's buffer)

- `GET /datasets/{id}/versions/{versionId}/summary`:
  - per File: rows, soil properties, bbox;
  - per soil property: count, min, max;
  - for raster: Bands and layer bbox.
- `GET /datasets/{id}/versions/{versionId}/rows?file_id=&cursor=`: paged vector rows from the buffer, in the preview table's shape.
- Showing buffered data on the map is out of scope: buffered rows can't be reached by the coverage and tile queries.

**Frontend**

- **Admin list:**
  - Add files on a PUBLISHED row opens a version (`POST …/versions`), then goes to `soil-data`. On a LOADED row it goes straight to `soil-data`, as in load-buffer-plan.md phase 5.
  - A Dataset with an open version shows "Published · v{n} pending" (or "v{n} ready" when LOADED), with Continue, Publish and Discard actions.
- **Steps:**
  - `useDatasetsSoilData`, `useMappingsStep`, `useRasterMappingStep` and `useDatasetPreviewStep` work on the version's Files only.
  - Files with `version_id IS NULL` are shown read-only.
  - Files in the version keep their remove and edit actions.
- **Last step:** a **Publish when loaded** checkbox. When ticked, the frontend queues `version-publish` with the current settings once the load job completes, which behaves like adding data in place.
- **Version review page:** the summary, the rows table per File, and Fix (remove or remap) per File.
- **Settings page for a version:** pre-filled from the Dataset, with Publish (queues `version-publish`) and Discard.
- **`DatasetsEditRedirect`:** a Dataset with an open version goes to its review page.
- **Types:** `frontend/src/types/backend.ts` gains `DatasetVersion`, and `version` on `Dataset`.

**Tests**
- Add files on a PUBLISHED Dataset opens a version.
- Publish and Discard queue their jobs.
- **Publish when loaded** publishes once the load completes.
- Loaded published Files are read-only in the steps.

**Docs**

- A new ADR superseding ADR 0071's "visible when the Merge commits at the end of the load", for PUBLISHED Datasets: versions, Merge at publish, and durable buffers. Amend ADR 0071 to point to it.
- `CONTEXT.md`: add **Dataset Version** (pending, published, discarded). Under **Merge**, add "runs at publish for a PUBLISHED Dataset".
- `docs/data-model/1-data-management-portal.md`: the version lifecycle, review, Publish when loaded, and Discard.
- `docs/data-model/1a-…`, `1b-…`: loads into a published Dataset go into its pending version.
- `docs/backend/async.md`: `version-publish`, `version-discard`.

---

## Measure first

As [load-buffer-plan.md](load-buffer-plan.md), plus:
- `SET LOGGED` time and WAL volume for the largest real load.
- Disk use with a version left pending: buffer, indexes, raw tables and COGs. This lasts until publish, not just for the length of a load.
- Publish Merge time. It's the same SQL as the end-of-load Merge, but reads a logged buffer.

## Deploy

As [load-buffer-plan.md](load-buffer-plan.md). The new migration needs no backfill: every Dataset starts at version 1 with no open version.
