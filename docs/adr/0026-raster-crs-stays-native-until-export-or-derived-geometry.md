# Raster CRS stays native; only derived geometry and export output are reprojected

**Status:** Accepted — partially supersedes ADR 0025, which included an eager ingest-time warp to EPSG:4326.

Rasters are now stored and ingested in whatever CRS they arrive in — `checkFileFormat`/`convertRaster` still normalize format (COG) and units, but no longer warp for CRS. ADR 0025's eager warp to EPSG:4326 was lossy (resamples every pixel, once, irreversibly) and reprojected the whole raster regardless of how much of it any AOI or export ever touched, when none of the actual consumers need the *stored file* to be 4326 — only specific *derived outputs* do. So reprojection moved to exactly where each of those outputs is produced: footprint tracing and `raster_layers.bbox` always reproject to EPSG:4326 (`GdalCLI.transformPoints`/`gdaltransform`, batched rather than per-tile); export-time masking (`getRasterMask`) builds its mask directly in a layer's native CRS so clipping stays a same-CRS intersection; and `RasterFileWriter`/`GeoFileWriter` warp only the already-clipped export output, and only when the export explicitly requests a `target_crs` — with none given, raster exports keep the layer's native CRS and vector exports keep the DB's stored EPSG:4326, unchanged.

## Consequences

- A dataset's raster layers can have different native CRSs from each other now (ingest-time warping previously forced everything to EPSG:4326 regardless of source) — `exportRasterData` groups layers by CRS before building masks.
- Any code that reads a raster's geoTransform and treats it as degrees must check the CRS first — `computeGrid`'s tile sizing and `analyzeRasterMeta`'s bbox both had this exact latent bug, masked until now by the ingest-time warp always making it true.
- The export-time warp's resampling method (`-r near` vs `-r bilinear`) comes from `raster_layers.is_categorical`, persisted at ingest from the band mapping rather than re-derived at export time, since the band mapping isn't in scope there. The column defaults to `false` (continuous).
