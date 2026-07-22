# ADR 0014: Raster detection in `extractMetadata` relies solely on GDAL; no file-extension fallback

`FileService.extractMetadata` decides whether an uploaded file is a raster or a vector by running `gdalinfo` once and checking whether it reports any bands. There is no fallback that classifies by file extension (e.g. `.tif`) when GDAL itself can't run.

## Considered Options

- **Extension fallback when GDAL is unavailable** — rejected. ADR 0004 already established GDAL as a hard deployment dependency for the vector path (`ogrinfo`/`ogr2ogr`), so a `GDAL_NOT_INSTALLED` failure means the vector path would fail identically. An extension-based classification couldn't make extraction succeed without GDAL — it would only pick which error message the caller sees, at the cost of extra branching logic and an extension whitelist to maintain.
- **GDAL-only detection** — chosen. `gdalinfo`'s failure (or empty `bands`) simply falls through to the existing `ogrinfo`-based vector path, and any GDAL-unavailable error surfaces the same way it already does for vector uploads today.

## Consequences

- If GDAL is ever genuinely missing in an environment, both raster and vector uploads fail with the same `GDAL_NOT_INSTALLED` error — there's no degraded extension-only classification to fall back on.
- `.zip` uploads (always vector shapefile bundles in this codebase) skip raster detection entirely rather than being probed with `gdalinfo`, avoiding a redundant zip extraction.
