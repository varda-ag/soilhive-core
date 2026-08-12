# ADR 0025: Raster normalization happens inside the loader; `convert_raster.sh` is removed

**Status:** Accepted — supersedes ADR 0004 (`ingest-raster-requires-pre-converted-cog`)

> **Amended by ADR 0026:** the "optional warp to EPSG:4326" described in the Decision below was
> removed — rasters are now normalized (COG, unit scaling) without reprojection and kept in their
> native CRS. Everything else in this ADR (moving conversion into `RasterIngestService`, deleting
> `convert_raster.sh`) is still current.

## Context

ADR 0004 split conversion from ingest: `convert_raster.sh` produced a Cloud Optimized GeoTIFF, and
`ingestRaster` refused anything else. It kept the GDAL creation options in a shell script on the
grounds that they are operationally tunable, and explicitly rejected a prototype that did the
conversion from TypeScript.

Two things have since eroded the premises rather than the reasoning.

ADR 0018 removed CLI raster ingestion, so a Raster Ingest is reachable only through a Raster Load.
That left nobody positioned to run the prior step: the file arrives by upload, and the person who
uploaded it is not at a shell. The precondition survived as a job failure telling a data admin to go
convert the raster themselves and upload it again — a refusal where the system had everything it
needed to act.

So the loader began normalizing deviating files itself (`checkFileFormat`), which it did by shelling
out to `convert_raster.sh`. That put the script back in the ingest path it had been separated from,
now with a text interface in between: arguments assembled by string, a path parsed back off stdout,
and the script's own dependency checks and band-count validation invisible to the caller. The
options were no longer being tuned independently either — every invocation came from one call site
that always passed the same shape.

## Decision

Move the conversion into `RasterIngestService`, expressed as `GdalCLI` calls (`warp`, `translate`,
`editInPlace`), and delete `convert_raster.sh`.

The pipeline is unchanged in substance — optional warp to EPSG:4326, optional per-band scale/offset
applied through a VRT and `-unscale`, then a COG translate — and the creation options are carried
over verbatim, including `OVERVIEW_RESAMPLING`, `BIGTIFF=YES` and `COMPRESS=ZSTD`.

What the boundary buys, now that it is a function call rather than a subprocess:

- GDAL's progress bars reach the job's progress reporter, so a long conversion reports movement
  instead of appearing hung between two checkpoints (`stepProgress`).
- Whether a band is categorical is decided from the band mapping rather than passed as a flag — a
  categorical band forces nearest-neighbour resampling for the whole file, since resampling is not
  per band.
- The band-count/factor invariant that the script enforced is enforced in the same place the factors
  are built, and a violation is a typed job failure rather than a shell exit code.

This does not reinstate `gdal-async`: conversion runs through the GDAL command-line tools, as ADR
0004 (`replace-gdal-async-with-cli-in-fileservice`) and ADR 0005 established for every other GDAL
operation.

## Consequences

- **The COG precondition is gone as a precondition.** A raster that is not a COG, is not EPSG:4326,
  or carries pixels in a non-standard unit is normalized rather than rejected. What remains a hard
  failure is a unit conversion that is not a single multiplication (`RL_UNIT_NOT_CONVERTIBLE`),
  because applying it approximately would silently produce wrong values.
- The conversion options are no longer separately runnable. Changing compression or block size means
  editing TypeScript and deploying, where before it meant editing a script. This is the real cost;
  it is accepted because nothing was tuning them independently, and because the single call site had
  already made the script's flexibility theoretical.
- `RL_CONVERSION_FAILED` no longer directs the reader to a script that exists. Its remedy is stated
  in terms of the target format instead, matching how `RL_UNIT_NOT_CONVERTIBLE` is worded.
- `gdal_edit.py` is now invoked directly rather than from the script, so it must be present on the
  server alongside `gdalwarp`, `gdal_translate` and `gdalinfo`. The script checked its dependencies
  up front; a missing tool now surfaces as `GDAL_NOT_INSTALLED` from `GdalCLI`.
- The build no longer ships shell scripts: `copy-scripts` is removed from `npm run build`, and
  `src/scripts` holds only TypeScript.
