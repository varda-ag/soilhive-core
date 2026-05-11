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
