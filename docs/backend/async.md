# Asynchronous Jobs

Long-running operations are handled as background jobs backed by [pg-boss](https://github.com/timgit/pg-boss), a PostgreSQL-based job queue. All jobs are created through the same endpoint and polled through a shared status API.

## Common API

**Enqueue a job**
```
POST /jobs
```

**List jobs for the authenticated user**
```
GET /jobs
```

**Poll job status**
```
GET /jobs/{jobId}
```

**Cancel a job**
```
DELETE /jobs/{jobId}
```

Job status values: `created`, `active`, `completed`, `cancelled`, `failed`.

**Job identity.** A job records the **Subject** of whoever submitted it in `created_by` — the token's `email` claim, else `client_id`, else `sub` (ADR 0022). The same value governs two things: which jobs `GET /jobs` lists and who may poll or cancel one, and which entitlements the processor resolves. Processors hold no raw token, so they re-derive entitlements from `everyone` plus the Subject's local rows; entitlements that exist only at the external endpoint are visible at enqueue time but not to the processor.

---

## `file-to-db`

Converts an uploaded geospatial file into a raw PostgreSQL table, making it available for column mapping and ingestion.

This is the first step in the data ingestion pipeline. It must complete before `bulk-load` can run on the same file.

**Trigger**
```json
POST /jobs
{
  "type": "file-to-db",
  "file_id": "<file_id>"
}
```

**Sequence of operations**

1. Retrieve the file record and resolve its storage path.
2. If the file is a ZIP archive, extract its contents to a temporary directory.
3. Auto-detect the geometry column (longitude/latitude pair or a native geometry field).
4. Use GDAL to open the source file — supports GeoJSON, Shapefile, GeoPackage, GML, KML, and other OGR-compatible formats.
5. Reproject all geometries to EPSG:4326 (WGS84).
6. Create a raw staging table named `raw_<file_id>` in PostgreSQL with sanitised field names and a `geometry` column.
7. Clean up any temporary extraction directories.

Once the job completes, the raw table is ready for the user to configure a data mapping, which is then consumed by `bulk-load`.

---

## `bulk-load`

Reads data from raw staging tables, applies the configured column mapping, and writes the records into the dataset as indexed soil observations.

**Trigger**
```json
POST /jobs
{
  "type": "bulk-load",
  "dataset_id": "<dataset_id>",
  "delete_source_files": true
}
```

`delete_source_files` is optional. When `true`, the original uploaded files are removed from storage after ingestion.

**Sequence of operations**

1. Set the dataset status to `ONGOING`.
2. Retrieve all pending file-to-dataset mappings for the dataset.
3. For each pending file:
   - Fetch the data mapping configuration.
   - Read records from the raw staging table in batches of 100.
   - Group every 10 records into a payload and send it to the internal endpoint `POST /datasets/{datasetSlug}/dataset-file-mapping/{datasetFileMappingId}/soil-data` using an internal service token.
   - Mark the file mapping as `LOADED`.
   - Drop the raw staging table (`raw_<file_id>`).
   - Delete source files from storage if requested.
4. Recalculate and persist dataset metadata: observation count, depth range, sampling date range, spatial extent, measured properties, and licence information.

---

## `export`

Exports soil data matching a saved filter to a downloadable archive in a user-selected geospatial format.

**Trigger**
```json
POST /jobs
{
  "type": "export",
  "filter_id": "<uuid>",
  "format": "csv|xlsx|gpkg|shp|geojson",
  "dataset_ids": ["<dataset_id>", "..."],
  "anonymous": false,
  "public_homepage_url": "https://...",
  "public_metadata_urls": {
    "<dataset_id>": "https://..."
  }
}
```

`anonymous`, `public_homepage_url`, and `public_metadata_urls` are optional. The `DOWNLOAD` capability is enforced for each dataset in `dataset_ids`.

**Sequence of operations**

1. Validate the requested format and create a temporary working directory.
2. Estimate the total record count for progress reporting.
3. Generate a `README.pdf` with dataset metadata and licence information.
4. Initialise a format-specific `GeoFileWriter` (CSV, XLSX, GeoPackage, Shapefile, or GeoJSON).
5. Fetch soil data in configurable batches, checking for cancellation before each batch:
   - Group records by measured property.
   - Append each group to the output file.
   - Update `progress_percentage` and cursor position on the job record after each batch.
6. Continue until all records are consumed.
7. Zip the working directory contents.
8. Move the archive to the download storage location.
9. Set the job state to completed with a `download_path` and `download_filename`.

When the job is retrieved via `GET /jobs/{jobId}`, the `download_path` is returned as a short-lived pre-signed URL (30-minute expiry).

---

## `data-requests`

Computes an analytical product over the spatial areas matching a filter. `statistics_type` chooses which product; the areas are resolved identically for every type, and only what is computed over them differs.

| `statistics_type` | Product | Output key |
|---|---|---|
| `descriptive` | Descriptive statistics over the matching observations, per area, dataset, soil property, sampling year and depth interval | `data` on `GET /data-requests/{id}` |
| `class-distribution` | Percentage or number of one soil property's observations in each caller-supplied class, per dataset, area, year window and depth bucket | `data` on `GET /data-requests/{id}` |
| `value-range` | How many observations of one soil property match, at how many locations, and their lowest and highest values, for the whole request and per dataset | `data` on `GET /data-requests/{id}` |

> **This queue is not reached through `/jobs`.** A data request is submitted, read and deleted through `/data-requests`, which applies a different rule at every point: anyone holding the id may read it, and `DELETE` destroys the record rather than only cancelling the run. `GET` and `DELETE /jobs/{jobId}` report a data-requests job as **not found** (docs/adr/0037).

> Not to be confused with `GET /datasets/{datasetId}/dataset-file-mapping/{id}/soil-data/stats`, which returns an ingest **cleaning report** — how many raw cells and rows were rejected. The two are unrelated.

**Trigger**
```json
POST /data-requests
{
  "statistics_type": "descriptive",
  "filter_id": "<uuid>",
  "file_id": "<file_id>",
  "dataset_ids": ["<dataset_id>", "..."],
  "histogram_bins": 10,
  "label_field": "field_name"
}
```

`statistics_type` and `filter_id` are required — there is **no default**, and a request that does not name its product is a `400`. Parameters the chosen type does not use are **rejected with a `400`, not ignored** — `histogram_bins` applies to `descriptive` only, `variable` to `class-distribution` and `value-range`, and `classes`, `class_count`, `class_method`, `value_type`, `time_aggregation` and `depth_ranges` to `class-distribution` only. `dataset_ids` applies to every type. Unknown properties are rejected by the same rule, which includes `type` and `anonymous`: both were `/jobs` concepts and neither has a meaning here. A missing or unrecognised `statistics_type` is a `400` on submission, and a job that somehow reaches the processor without a usable one fails rather than falling back to `descriptive`.

**No token is required.** A token, if sent, decides only which datasets the run may read — without one it resolves public datasets only — and is never consulted again. It does not decide who may read or delete the result: the returned `id` is the whole of that permission, so passing it on passes on the data *and* the power to erase it.

### Aggregation areas

> This section applies to **`soil-indexes` as well as `data-requests`**: both are *runs*, and a run resolves its areas the same way whichever product it computes.

Statistics are grouped by **aggregation unit**, and each unit is one stored filter geometry:

- **without `file_id`** — one unit per geometry of `filter_id`;
- **with `file_id`** — one unit per geometry in that file. **The filter's own geometries are then not used**: `filter_id` contributes only its criteria. The file's geometries are stored and attached to a new *derived* filter, whose id is returned as `derived_filter_id`.

Either way the geometries are read back from `GET /data-filters/{filterId}/geometries`, which returns one GeoJSON Feature per unit whose `id` is the `unit_id` used throughout the output. A derived filter stores no geometries inline, so that endpoint is the only way to read them. It pages with an opaque `cursor`: pass the previous response's `next_cursor` until it comes back `null`.

A file supplying units must be a spatial vector file with a known EPSG code and only polygon or multipolygon geometries; a multipolygon counts as **one** unit. Equivalent geometries collapse into one unit that keeps every source `record_id`. The number of units is capped by `MAX_AGGREGATION_UNITS` (default 2000; `DATA_REQUESTS_MAX_UNITS` is the deprecated former name, still honoured) and the job fails above it rather than dropping areas silently.

All of the above holds for **every** product on **either** queue, cap included: the output of each grows with the number of units, so the same ceiling applies. `derived_filter_id`, `unit_count` and `units[]` are likewise always written — by the shared run machinery, before the product runs, so no product can omit them.

## `data-requests` — `descriptive`

### Filtering

Identical to `GET /data-filters/{filterId}/coverage`, including raster filters, dataset status and visibility.

`PREVIEW` is enforced per dataset. Naming a dataset you cannot preview is rejected on submission with `403`; when `dataset_ids` is omitted, datasets you cannot preview are skipped. Which ones were skipped is written to the server log only — a caller cannot tell from the job that anything was left out.

**Sequence of operations**

1. Resolve the filter and build the aggregation units, creating the derived filter when `file_id` is given.
2. Select the datasets the filter matches, applying `PREVIEW`.
3. Resolve the units to sampling locations (features) intersecting them.
4. Collect the matching observations into a staging table, one row per observation.
5. Aggregate: `overall` per (dataset, soil property), then per unit, then per (unit, year, depth interval).
6. Write progress into the job data.
7. Record the outcome — the payload, or the reason there is none — as a `data_requests` row keyed by the job id.

### Reading it back

```
GET /data-requests/{id}
```

```jsonc
{
  "id": "…",                       // the job's id, and the whole of the permission to read this
  "status": "completed",           // pending | running | completed | failed
  "created_at": "…",
  "completed_at": "…",
  "progress_percentage": 100,      // absent once the run has been removed by retention
  "progress_description": "…",     // likewise
  "message": null,                 // why it failed; null otherwise
  "request": { /* what was asked, plus the resolved units, derived_filter_id and unit_count */ },
  "data": { "results": [ /* per dataset and soil property */ ], "truncated": false }
}
```

`request` carries the resolved `units[]` for a reason: `unit_id` in the payload is an opaque identifier, and the units are the only place its label and area appear — so the result stays interpretable after the run is gone.

**Lifetime.** Progress comes from the run, which pg-boss keeps for 30 days; the request and its result are kept indefinitely, until deleted. Every terminal outcome is recorded, success or failure — but a **cancelled** run records nothing, because cancelling is how a data request is destroyed.

```
DELETE /data-requests/{id}
```

Cancels the run if it is still in progress and permanently deletes the request and its result. `204` if either happened, `404` if neither was there. Irreversible, and open to anyone holding the id — including anyone it was shared with.

## `data-requests` — `class-distribution`

The share (or number) of one variable's values in each **class**, per dataset, area, **year window** and depth bucket. Datasets and filtering are as for `descriptive`.

```json
POST /data-requests
{
  "statistics_type": "class-distribution",
  "filter_id": "<uuid>",
  "variable": { "type": "soil-property", "id": "ph" },
  "classes": [
    { "name": "Acid", "max": 6.5 },
    { "name": "Neutral", "min": 6.5, "max": 7.5 },
    { "name": "Alkaline", "min": 7.5 }
  ],
  "value_type": "percentage",
  "time_aggregation": 3,
  "depth_ranges": "standard"
}
```

Checked on submission (`400` on failure):

- **`variable`** (required): an existing soil property, which the filter's `soil_properties` must allow if set. A soil index run is also accepted (see below).
- **`classes`** (1–20) or **`class_count`** + **`class_method`**, exactly one of the two:
  - `classes`: `{ name, min?, max? }`, `[min, max)`, at least one bound, no overlaps, unique names, `unclassified` reserved.
  - `class_count` (3–20, total) + `class_method` generates them once per request from the matching observations (each counted once). The first and last classes are open-ended. `equal-interval` uses equal readable widths (`4.0–4.8`) over the 1st–99th percentile range, which suits histograms. `quantile` gives about equal counts per class. Equal edges merge, so fewer classes may come back.
- **`value_type`** (required): `percentage` or `count`.
- **`time_aggregation`** (1–10, default 1): years per window, aligned to multiples (with 3, 2019 is always in 2019–2021). Undated observations get `year_start`/`year_end` `null`.
- **`depth_ranges`** (default `none`): `none` pools all depths. `standard` uses the GlobalSoilMap range holding each layer's depth midpoint, so a 0–30 cm composite lands in 15–30. Layers with no depth get their own bucket.

**Output**: one flat row per distribution, with `classes` ready for recharts:

```jsonc
{
  "soil_property": "ph",
  "standard_unit": "pH",
  "classes": [                          // the request's classes, or the generated ones
    { "name": "Acid", "max": 6.5 },
    { "name": "Neutral", "min": 6.5, "max": 7.5 },
    { "name": "Alkaline", "min": 7.5 }
  ],
  "observed_min": 3.9,                  // request-wide extremes
  "observed_max": 8.4,
  "results": [
    {
      "dataset_id": "lucas-2018",
      "unit_id": "…",
      "year_start": 2016, "year_end": 2018,
      "depth_start": 15, "depth_end": 30,   // only with depth_ranges standard; depth_end null for > 200 cm
      "depth_min": 0, "depth_max": 30,      // span of the layers behind the row
      "count": 57, "n_features": 41,
      "classes": [
        { "name": "Acid", "value": 42.105 },
        { "name": "Neutral", "value": 50.877 },
        { "name": "Alkaline", "value": 5.263 },
        { "name": "unclassified", "value": 1.754 }
      ]
    }
  ]
}
```

- Values sum to 100 (percentages, 3 decimals) or to `count`. Every class appears in every row, and `unclassified` comes last, only when above 0.
- Rows are never pooled across datasets. Empty rows are omitted and small ones kept, so check `count`. An observation in two overlapping areas counts in both.
- Generated classes live in `data`, not `request`, so two runs may differ. With no matches, generated `classes` is `[]` and the extremes are absent.

**Size**: the run fails if rows × (classes + 1) exceeds `DATA_REQUESTS_MAX_CLASS_ENTRIES`. It never truncates (docs/adr/0038).

## `data-requests` — `value-range`

How many values of one variable match, at how many locations, and their lowest and highest values. Use it before choosing classes by hand. `variable` follows the `class-distribution` rules, and the other types' parameters are a `400`.

```json
POST /data-requests
{
  "statistics_type": "value-range",
  "filter_id": "<uuid>",
  "variable": { "type": "soil-property", "id": "ph" }
}
```

```jsonc
{
  "soil_property": "ph",
  "standard_unit": "pH",
  "count": 612, "n_features": 540, "min": 3.9, "max": 41.0,   // whole request, each observation once
  "datasets": [
    { "dataset_id": "farm-grid",  "count": 400, "n_features": 400, "min": 5.1, "max": 41.0 },
    { "dataset_id": "lucas-2018", "count": 212, "n_features": 140, "min": 3.9, "max": 8.4 }
  ]
}
```

- Only datasets with matches are listed. With none: `count: 0`, `n_features: 0`, no `min`/`max`, `datasets: []`.
- No size limit, since output grows with datasets only.

## `data-requests` — over a soil index run's scores

`class-distribution` and `value-range` can read a completed [`soil-indexes`](#soil-indexes) run's scores instead of observations (docs/adr/0039):

```json
"variable": { "type": "soil-index", "id": "<soil index run id>" }
```

- The id must be a completed run, and holding it is the permission to read its scores. Any unusable id gives the same `400`.
- A score belongs to the areas containing its representative point.
- The filter must carry no criteria, since it supplies only the area.
- Scores have no dataset, depth or location, so `dataset_ids` and `depth_ranges` are `400`s, rows have no `dataset_id`/`n_features`, and a value range has no `datasets`. CREA records no year, so its scores fall in the no-year window.
- Output opens with `run` and `soil_index_type` (absent for an empty run) instead of `soil_property`/`standard_unit`.

## `soil-indexes`

Computes a **soil index** — a single score per aggregation area, from a named methodology — over the areas matching a filter. The areas are resolved exactly as for `data-requests`; only the product differs.

| `soil_index_type` | Product | Output key |
|---|---|---|
| `crea-index` | One scored GeoJSON Point per area | none — the scores are rows in the `soil_index` table, keyed by the job id as the run |

> Not to be confused with the **DAI**, which is also an index but scores *data availability* per map cell and is computed by the `refresh-dai-stats` job. The two share nothing.

**Trigger**
```json
POST /jobs
{
  "type": "soil-indexes",
  "soil_index_type": "crea-index",
  "filter_id": "<uuid>",
  "file_id": "<file_id>",
  "label_field": "field_name"
}
```

`soil_index_type` and `filter_id` are required, and there is **no default**: omitting the type is a `400`, not an implicit `crea-index`. Same rule as `statistics_type` — a run names the product it computes. `dataset_ids` and `histogram_bins` do not exist on this queue.

This queue runs **one job at a time per node** (`SOIL_INDEXES_CONCURRENCY`), which is the reason it exists: an index run is long, and while it shared the `data-requests` queue every data request behind it waited.

> **The CREA values are currently mock data.**

**Sequence of operations**

1. Resolve the filter and build the aggregation units, creating the derived filter when `file_id` is given, and write `derived_filter_id`, `unit_count` and `units[]`.
2. Resolve one representative point per unit.
3. Score each point, write the rows into a fresh partition for the run, and attach it.
4. Mark the job complete.

Every row carries its own `soil_index_type`. A run's pg-boss record is deleted after 30 days while its partition is permanent, so without it an old score would be a number with no methodology attached.

---

## `bulk-delete`

Permanently removes a dataset and all of its soil data, cleaning up any features and spatial layers that are no longer referenced by other datasets.

**Trigger**
```json
POST /jobs
{
  "type": "bulk-delete",
  "dataset_id": "<dataset_id>"
}
```

**Sequence of operations**

1. Mark the dataset record as deleted via the dataset service.
2. Open a database transaction with a 5-minute statement timeout.
3. Loop until all associated records are removed (1 000 rows per iteration):
   - Find a chunk of `dataset_layers` rows linked to the dataset.
   - Delete those `dataset_layers` rows and capture the affected `feature_id` and `layer_id` sets.
   - Delete orphaned `features`: rows whose `feature_id` is in the set and that no other `dataset_layers` row still references.
   - Delete orphaned `layers`: rows whose `layer_id` is in the set and that no other `dataset_layers` row still references.
4. Commit the transaction.

Chunked deletion avoids locking large tables for extended periods. Orphan checks ensure that features and layers shared across multiple datasets are only removed once the last referencing dataset is deleted.
