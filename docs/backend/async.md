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

Extracts descriptive statistics from soil observations matching a filter, reported per spatial area, dataset, soil property, sampling year and depth interval. The result is written into the job's own data and read back through `GET /jobs/{jobId}`.

> Not to be confused with `GET /datasets/{datasetId}/dataset-file-mapping/{id}/soil-data/stats`, which returns an ingest **cleaning report** — how many raw cells and rows were rejected. The two are unrelated.

**Trigger**
```json
POST /jobs
{
  "type": "soil-statistics",
  "filter_id": "<uuid>",
  "file_id": "<file_id>",
  "dataset_ids": ["<dataset_id>", "..."],
  "histogram_bins": 10,
  "label_field": "field_name"
}
```

Only `filter_id` is required.

### Aggregation areas

Statistics are grouped by **aggregation unit**, and each unit is one stored filter geometry:

- **without `file_id`** — one unit per geometry of `filter_id`;
- **with `file_id`** — one unit per geometry in that file. **The filter's own geometries are then not used**: `filter_id` contributes only its criteria. The file's geometries are stored and attached to a new *derived* filter, whose id is returned as `derived_filter_id`.

Either way the geometries are read back from `GET /data-filters/{filterId}/geometries`, which returns one GeoJSON Feature per unit whose `id` is the `unit_id` used throughout the output. A derived filter stores no geometries inline, so that endpoint is the only way to read them. It pages with an opaque `cursor`: pass the previous response's `next_cursor` until it comes back `null`.

A file supplying units must be a spatial vector file with a known EPSG code and only polygon or multipolygon geometries; a multipolygon counts as **one** unit. Equivalent geometries collapse into one unit that keeps every source `record_id`. The number of units is capped by `SOIL_STATISTICS_MAX_UNITS` (default 200) and the job fails above it rather than dropping areas silently.

### Filtering

Identical to `GET /data-filters/{filterId}/coverage`, including raster filters, dataset status and visibility. Raster datasets never contribute — their measurements are pixels, not observations — and are reported in `excluded_datasets`.

`PREVIEW` is enforced per dataset. Naming a dataset you cannot preview is rejected on submission with `403`; when `dataset_ids` is omitted, datasets you cannot preview are skipped and listed in `skipped_datasets`.

**Sequence of operations**

1. Resolve the filter and build the aggregation units, creating the derived filter when `file_id` is given.
2. Select the datasets the filter matches, dropping raster ones and applying `PREVIEW`.
3. Resolve the units to sampling locations (features) intersecting them.
4. Collect the matching observations into a staging table, one row per observation.
5. Aggregate: `overall` per (dataset, soil property), then per unit, then per (unit, year, depth interval).
6. Write results, `truncated` and progress into the job data.

### Output

`results` is grouped by dataset and soil property. Each group carries:

- `overall` — computed before areas are fanned out, so an observation inside two overlapping units is counted **once**. It therefore does *not* equal the sum of the per-unit counts.
- `units[]` — the headline statistics per aggregation unit. Overlapping units each count a shared observation, so that "mean pH in this field" means exactly that.
- `units[].breakdown[]` — the same statistics per sampling year and depth interval. Undated observations and those with no recorded depth form their own `null` buckets, never merged into a neighbour. **Absent when it would hold a single cell**, because that cell covers exactly the observations behind `units[]` and would repeat it field for field; the cell's own keys are then recoverable from the unit cell (`min_depth`/`max_depth` are its `depth_min`/`depth_max`, and `year` is the first four characters of `sampling_date_min` when they are digits). A present `breakdown` always holds at least two cells, and `l4_included: false` is what distinguishes "withheld to fit the budget" from "identical to the unit cell".

Every cell reports `count`, `n_features`, `n_layers`, `min`, `max`, `mean`, `median`, `stddev`, `p05`, `p25`, `p75`, `p95`, sampling-date and depth ranges, the distinct `horizons` and `laboratory_methods` mixed into it, and a `histogram` of `histogram_bins` (default 10) equal-width bins spanning `min`–`max`. Values are in the soil property's `standard_unit`, applied at ingestion.

The whole result has to fit inside the job's data, so a cell spends bytes only on what cannot be recovered from it. Four rules follow, and a client should be written to expect all four:

- **Numbers are rounded to 3 decimals** — every statistic, plus `bin_width` and `area_m2`.
- **A field with nothing to report is absent, not `null` or `[]`.** `stddev`, `sampling_date_min`/`_max`, `depth_min`/`_max`, `horizons` and `laboratory_methods` simply do not appear when they have no value. The one exception is a breakdown cell's `year`, `min_depth` and `max_depth`: there `null` identifies the bucket, so it is always spelled out.
- **`histogram` is only emitted when `count > 100`.** Below that the bins describe the sample rather than the distribution, and `min`/`median`/`max` already say what little there is to say.
- **Breakdown cells omit `depth_min`/`depth_max`.** The breakdown is grouped *by* depth interval, so those aggregates are exactly the cell's own `min_depth`/`max_depth`.

Three figures are derivable and therefore not sent: the coefficient of variation (`stddev / |mean|`), the interquartile range (`p75 - p25`), and the histogram's bin boundaries (`min + i * bin_width`, the last one being `max`).

`median` is interpolated (`percentile_cont`), not an observed value. When every value in a cell is identical the histogram degrades to a single bin — test `counts.length === 1` rather than `bin_width === 0`, because a genuine width below 0.0005 also rounds to 0.

If the breakdown would exceed `SOIL_STATISTICS_MAX_CELLS` (default 200 000), whole (dataset, soil property) groups lose it: `truncated` becomes `true` and each affected group reports `l4_included: false`. Headline numbers are never truncated. The budget counts only cells that will actually be emitted, so the single cells omitted above are free and cannot push another group over the limit.

`units[].area_m2` is the whole geometry's area. Raster filters restrict which observations count but never clip the geometry, so when `raster_filtered` is true the statistics cover less ground than that area suggests.

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
