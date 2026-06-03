# ADR 0004: `ingestRaster` requires a pre-converted COG; conversion stays in `convert_raster.sh`

**Status:** Accepted

## Context

The original raster ingest pipeline had `RasterIngestService` spawn `convert_raster.sh` as a subprocess to convert a GeoTIFF to COG, then immediately ingest the result. This coupled conversion and ingest into a single TypeScript call.

The alternative considered was to rewrite the COG conversion in TypeScript using `gdal.translateAsync()`, eliminating the shell dependency entirely. This was prototyped but rejected: the conversion step involves GDAL creation options (`OVERVIEWS=AUTO`, `BIGTIFF=YES`, resampling method) that are operationally tunable, and keeping them in a standalone shell script makes them easier to inspect, override, and run independently without touching the service code.

## Decision

Split conversion and ingest into two distinct tools with a clear interface boundary:

- **`convert_raster.sh`** — converts GeoTIFF → COG. Standalone, callable from any context (CI, manual ops, data pipelines). No TypeScript dependency.
- **`ingestRaster()`** — accepts only COG input. Validates the precondition via `gdal-async` (LAYOUT metadata + blockSize/overviews heuristic), throws if not met, then runs metadata extraction, DB insert, and footprint streaming.

The `out`, `outDir`, and `resampling` options are removed from `IngestRasterOptions` — they only existed to parameterize the conversion step, which is now the caller's responsibility.

## Consequences

- Callers must run `convert_raster.sh` before calling the TypeScript ingest service. The error message on a non-COG input directs them there.
- The two tools can evolve independently: conversion options (compression, block size, resampling) can change in the shell script without touching the service.
- The TypeScript service has a stricter, testable precondition instead of a side-effectful conversion step.
