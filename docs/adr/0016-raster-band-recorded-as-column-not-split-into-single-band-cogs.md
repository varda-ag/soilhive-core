# ADR 0016: A raster band is recorded as a column on `raster_layers`, not split into single-band COGs

**Status:** Accepted

## Context

Supporting multiband rasters means a single COG must be able to back several raster layers — one per band. Nothing in the schema could express that: `raster_layers` had no band column, so N bands of one file produced N rows distinguishable only by their soil property, and the export path read band 1 unconditionally (`samples: [0]` when reading source pixels, `-b 1` when translating a source raster).

The obvious alternative was to forbid multiband input entirely and have `convert_raster.sh` split an N-band GeoTIFF into N single-band COGs before ingest. That follows directly from ADR 0004, which already made *preparing* the raster the caller's responsibility and gave `ingestRaster` a strict precondition it validates and rejects. "Input must be a single-band COG" is exactly that shape of precondition, and it would have required no schema change, no migration, and no change to the export writer.

## Decision

Add `band` (`int NOT NULL DEFAULT 1`, 1-based) to `raster_layers`, and make the read and write paths band-aware:

- A Raster Ingest consumes one band and produces one raster layer. The band number is 1-based everywhere a person or the database can see it; the conversion to geotiff.js's 0-based `samples` index happens only at that library boundary.
- `(file_id, band)` is unique (partial, `WHERE deleted_at IS NULL`), making a raster layer's identity the pair of file and band, and making re-ingest of a band idempotent.
- Footprints are derived per band, because each band carries its own valid-data mask.

## Considered options

**Split multiband files into single-band COGs.** Rejected. It duplicates the pixel data N times — the dominant storage cost, since raster files are never consumed by a Raster Load and must survive for the lifetime of the layer — and it discards the fact that the bands share a source file, a set of overviews, and one object to fetch from storage. The operational reason multiband COGs exist is that they are one file; splitting them at the door forfeits that.

**Store the band inside the existing `description` jsonb.** Rejected. The band must reach the export writer through a raw projection in a cached, hot spatial query, and `description` is declared as free-form auxiliary metadata on both raster entities — overloading it would invent an undocumented schema inside a jsonb column.

## Consequences

- The export path must select `band` and honour it. Two source reads are band-dependent: reading source pixels when masking, and translating a source raster by bbox. Reads of the writer's *own* single-band temp tiles stay pinned to band 1 and must not be changed.
- `resolution` and `bbox` remain band-independent (they are properties of the file), while `nodata` and footprints are per-band. A GeoTIFF cannot express differing nodata values per band — GDAL's `GDAL_NODATA` tag is dataset-wide — so in practice sibling bands of a COG share a nodata value and differ only in their masks.
- The unique constraint means any pre-existing duplicate raster layers for one file block the migration. The migration pre-checks and fails with an actionable message rather than surfacing a raw index violation.
- `n_raster_layers` can no longer be incremented during ingest: the increment would have to be decided before the layer insert reveals whether the row is new. It is recomputed as a count by the dataset metadata step instead, which also self-heals counters drifted by past re-ingests.
