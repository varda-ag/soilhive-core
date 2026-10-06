# ADR 0004: Replace `gdal-async` with CLI tools in `FileService`

**Status:** Accepted

`FileService` previously used the `gdal-async` Node.js native addon for two distinct operations: opening source files to extract metadata (field names, geometry type, SRS), and translating them into PostgreSQL via `GDALVectorTranslate`. Both are now delegated to `ogrinfo` and `ogr2ogr` subprocess calls.

## Considered Options

- **Keep `gdal-async`** — rejected for an unrelated reason.
- **`gdal3.js` (WASM)** — a WASM-compiled GDAL with a Node.js API. Rejected for the metadata/ingestion path because WASM cannot use GDAL's `/vsis3/` virtual filesystem, which is required for S3-backed file storage; and because it would require maintaining a second GDAL version alongside the system one already needed for the XLSX vector driver.
- **Format-specific JS libraries** — rejected because the supported file formats (CSV, XLSX, GPKG, SHP, GeoJSON, KML, GML, ZIP) span too many libraries, and GPKG/SHP write support in pure JS is immature.
- **`ogr2ogr` + `ogrinfo` CLI** — chosen. System GDAL is already a hard deployment dependency (XLSX driver requires `--shared_gdal`-free system GDAL, per ADR 0003). Shelling out removes the native addon compile step while keeping full format support.

## Consequences

- `layer_name` and `geom_column` are now stored in `FileMetadata` at upload time, because `fileToDB` can no longer re-open the source dataset to derive them. Files with metadata extracted before this change will fail ingestion with a clear assertion error directing the user to re-upload.
- AWS GDAL config (`AWS_VIRTUAL_HOSTING`, `AWS_HTTPS`) that was previously set via `gdal.config.set()` must instead be passed as environment variables to the subprocesses.
- GDAL errors that previously could crash the Node.js process (native addon segfault) now surface as subprocess exit codes.
