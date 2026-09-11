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

## `soil-statistics`

Computes an analytical product over the spatial areas matching a filter. `statistics_type` chooses which product; the areas are resolved identically for every type, and only what is computed over them differs.

| `statistics_type` | Product | Output key |
|---|---|---|
| `descriptive` (default) | Descriptive statistics over the matching observations, per area, dataset, soil property, sampling year and depth interval | none — removed, pending tables of its own |
| `crea-index` | One scored GeoJSON Point per area | none — the scores are rows in the `crea_index` table |

> Not to be confused with `GET /datasets/{datasetId}/dataset-file-mapping/{id}/soil-data/stats`, which returns an ingest **cleaning report** — how many raw cells and rows were rejected. The two are unrelated.

**Trigger**
```json
POST /jobs
{
  "type": "soil-statistics",
  "statistics_type": "descriptive",
  "filter_id": "<uuid>",
  "file_id": "<file_id>",
  "dataset_ids": ["<dataset_id>", "..."],
  "histogram_bins": 10,
  "label_field": "field_name"
}
```

Only `filter_id` is required. Parameters the chosen type does not use are **rejected with a `400`, not ignored** — `histogram_bins` and `dataset_ids` apply to `descriptive` only. An unrecognised `statistics_type` is a `400` on submission, and a job that somehow reaches the processor with one fails rather than falling back to `descriptive`.

### Aggregation areas

Statistics are grouped by **aggregation unit**, and each unit is one stored filter geometry:

- **without `file_id`** — one unit per geometry of `filter_id`;
- **with `file_id`** — one unit per geometry in that file. **The filter's own geometries are then not used**: `filter_id` contributes only its criteria. The file's geometries are stored and attached to a new *derived* filter, whose id is returned as `derived_filter_id`.

Either way the geometries are read back from `GET /data-filters/{filterId}/geometries`, which returns one GeoJSON Feature per unit whose `id` is the `unit_id` used throughout the output. A derived filter stores no geometries inline, so that endpoint is the only way to read them. It pages with an opaque `cursor`: pass the previous response's `next_cursor` until it comes back `null`.

A file supplying units must be a spatial vector file with a known EPSG code and only polygon or multipolygon geometries; a multipolygon counts as **one** unit. Equivalent geometries collapse into one unit that keeps every source `record_id`. The number of units is capped by `SOIL_STATISTICS_MAX_UNITS` (default 2000) and the job fails above it rather than dropping areas silently.

All of the above holds for **every** `statistics_type`, cap included: the output of each type grows with the number of units, so the same ceiling applies. `derived_filter_id`, `unit_count` and `units[]` are likewise written by every type.

## `soil-statistics` — `descriptive`

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

### Output

> **TODO**: to be implemented in a future release

## `soil-statistics` — `crea-index`

> **The values are currently mock data.**

**Sequence of operations**

1. Resolve the filter and build the aggregation units, creating the derived filter when `file_id` is given.
2. Write `derived_filter_id`, `unit_count` and `units[]`.
3. Resolve one representative point per unit.
4. Score each point, write the rows into a fresh partition for the run, and attach it.
5. Mark the job complete.

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
