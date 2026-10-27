# Raster Filter Installation is API-only; the CLI is removed

**Status:** Accepted. The counterpart of ADR 0018 for Raster Filters.

`--load-raster-filter` restored a prebuilt `.dump` and ran a `.mappings` SQL file against the database. It is removed, along with `utils/db-restore.ts`. A Raster Filter is now installed only through `POST /raster-filters`, from a GeoTIFF uploaded with `POST /files`, by the `raster-filter-install` job. The hosted packages are republished as GeoTIFFs plus a mappings JSON shaped as the `PUT /raster-filters/{id}/mappings` body.

## Considered options

- **Keep the CLI as a thin wrapper** that registers a local file and enqueues the same job, so large files skip the HTTP upload. Rejected to keep a single install path.

## Consequences

- Global filters are multi-GB, so `MAX_UPLOAD_SIZE_MB` now defaults to 5000 (was 500). `POST /files` streams to storage, so the size costs no memory. Any reverse-proxy body limit must be raised to match.
- The shared limit is no longer safe for the logo, which is read into memory. ADR 0029 is amended with a logo-specific cap.
