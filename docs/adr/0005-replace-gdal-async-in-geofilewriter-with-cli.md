# ADR 0005: Replace `gdal-async` in `GeoFileWriter` with CLI tools

**Status:** Accepted

`GeoFileWriter` was the last remaining user of the `gdal-async` native addon after ADR 0004
removed it from `FileService`. It now writes soil export files (CSV, XLSX, GPKG, SHP, GeoJSON)
by building a per-batch GeoJSON intermediate and invoking `ogr2ogr` via `GdalCLI`.

## Considered Options

**Collapse to a single write at the end** — buffer all export records in memory and call
`ogr2ogr` once after the final batch. Simpler, but requires holding the entire result set
in memory. Rejected in favour of preserving the per-batch streaming interface that already
exists in `soilExportJob.ts`.

**Per-batch GeoJSON intermediate + `ogr2ogr`** — chosen. For each `closeFile()`, each
property's buffered records are serialised to a temp GeoJSON file, passed to `ogr2ogr`,
then deleted. Subsequent batches use `ogr2ogr -update -append` for existing layers, or
`ogr2ogr -update` to add a new layer to an existing single-file dataset. The
`createdLayers` set inside `GeoFileWriter` tracks which layers have been written so the
correct flags are selected — no need to re-read the output file from disk.

**GeoJSON as the universal intermediate** — chosen over splitting by format class (CSV for
tabular, GeoJSON for spatial). GeoJSON handles both null geometries (tabular) and
`wellknown`-parsed point geometries (spatial), is writable from Node.js with no library,
and is accepted by all five output format drivers.

## XLSX append result

`ogr2ogr -update` correctly adds new sheets to an existing XLSX file, and
`ogr2ogr -update -append` correctly appends rows to an existing sheet. Verified by the
`GeoFileWriter.test.ts` suite on the Alpine system GDAL (3.10.3). No XLSX fallback needed.

## Coordinate reference system

`-a_srs EPSG:4326` (not `-s_srs`) is used when creating a spatial layer for the first
time, consistent with ADR 0003. The GeoJSON intermediate is always in WGS84 (RFC 7946),
so no reprojection is required; `-a_srs` assigns the SRID without invoking the
transformation pipeline.

## Consequences

- `gdal-async` is removed from `package.json` entirely. The native compile step no longer
  runs during `npm install`.
- `GeoFileWriter` accumulates records per-batch in a `Map<string, ExportRecord[]>`;
  `closeFile()` performs the ogr2ogr calls and clears the buffer. The public interface
  (`openFile / setProperty / writeRecord / closeFile`) is unchanged.
- Test verification replaced `gdal.openAsync()` with `GdalCLI.ogr2ogr` to CSV + CSV
  parsing. CSV-to-CSV conversion via ogr2ogr quotes numeric values; the test helper strips
  surrounding quotes before `parseFloat`.
- The `gdal.config.set()` calls in the already-skipped `s3-storage-files.test.ts` were
  replaced with direct `process.env` assignment (consistent with ADR 0004's consequence on
  AWS config).
