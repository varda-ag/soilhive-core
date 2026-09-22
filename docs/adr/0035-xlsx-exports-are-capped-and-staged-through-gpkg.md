# ADR 0035: XLSX Exports are capped and staged through GPKG

**Status:** Accepted

`GeoFileWriter` writes each batch of an **Export** by shelling out to `ogr2ogr` once per **Soil Property** present in that batch. For every format except XLSX this is cheap, because the driver appends incrementally. GDAL's XLSX driver does not: it materialises the whole workbook in memory on open and rewrites it on close, so `-update -append` re-loads everything written so far on every call. Cost is therefore quadratic in the number of records, in memory as well as in time, and the `ogr2ogr` child counts against the pod's cgroup — a 1.5M-record XLSX Export OOM-killed a production pod at ~620,000 records.

XLSX now runs the batch loop against a staging GPKG (one layer per Soil Property) and converts to XLSX in a single `ogr2ogr` invocation at the end, so the workbook is built exactly once. Because even one build is unbounded, XLSX Exports are additionally capped at `EXPORT_XLSX_MAX_RECORDS` (default 300,000) — checked in the job as soon as `total_records_estimate` is known, and failed with a translatable code that names the cap and directs the caller to `csv` or `gpkg`. No other format is capped, because no other format has to hold its output in memory.

## Considered Options

- **Stage to per-property CSV** — rejected. Cheaper on temp disk than GPKG, but the final step is still one `ogr2ogr -update` call per Soil Property into a growing workbook, so the quadratic remains, merely with a smaller exponent base.
- **Stream XLSX from JS (`exceljs` `WorkbookWriter`)** — rejected, though it is the only option with genuinely constant memory and would remove the need for a cap. It puts a second XLSX implementation beside the system GDAL that ADR 0004 deliberately standardised on, for one format on one code path. Worth revisiting if the cap proves too tight in practice.
- **Chunk into multiple XLSX files** — rejected. Removes the size ceiling but changes what the user downloads, and the readme and file manifest would have to explain a split that exists for an internal reason.
- **Enqueue-time rejection instead of in-job** — rejected. It would match the precedent set by `validateDataRequestJob`, but the filter-scoped count runs with a 60s statement timeout and no HTTP endpoint pays for it today; the job already computes the same number for free before writing anything.

## Consequences

- The staging layers must be created aspatial (`-nlt NONE`). A tabular Export carries geometry as a WKT string in a field named `geom`, and GPKG names its own geometry field the same thing, so without the flag every staging write fails with "Cannot create field geom. It has the same name as the geometry field." The direct-to-XLSX path never met this because the XLSX driver has no geometry field at all. Verified against GDAL 3.13: the aspatial tables convert to worksheets with the column set unchanged.
- The cap is a user-facing contract. Raising `EXPORT_XLSX_MAX_RECORDS` is safe; lowering it breaks workflows built on the current value.
- The conversion's peak RSS is linear in record count, measured on GDAL 3.13 over the real column set with a distinct geometry per row (repeated strings collapse into the workbook's shared-strings table and make a synthetic benchmark far too optimistic):

  | records | peak RSS | wall time | .xlsx |
  |--------:|---------:|----------:|------:|
  |    100k |   163 MB |       2 s | 7.3 MB |
  |    300k |   369 MB |       4 s |  22 MB |
  |      1M |   903 MB |      16 s |  73 MB |

  Roughly 0.85 KB per record over an ~80 MB floor. The budget that matters is not one conversion, though: the export queue runs at `JOB_LOCAL_CONCURRENCY` (default 3) per node, so the pod must absorb three of these at once — ~1.1 GB at the 300,000 default, ~2.7 GB at 1,000,000 — on top of Node's own heap. Raise the cap only together with the pod's memory limit or a `localConcurrency: 1` on the export queue.
- The premise that GPKG appends do not reload the file is measured, not assumed. Appending one 5,000-record batch costs a flat 73 MB and 0.34 s whether the target holds 10,000 rows or 500,000. The same append into an XLSX - the old path - costs 86 MB / 0.7 s at 10,000 rows, 165 MB / 3.2 s at 100,000 and 341 MB / 9.2 s at 300,000, which is the quadratic that killed the pod.
- The memory table above is a single worksheet, which is the worst case. The same 300,000 records spread over 20 Soil Property worksheets convert in 324 MB against 403 MB for one sheet, so a real Export sits under those figures rather than over them.
- XLSX Exports now need temp disk for both the staging GPKG and the final workbook, roughly doubling peak temp usage for that format.
- Excel's own 1,048,576-rows-per-sheet limit is not separately enforced, which is safe only while the cap stays well under it. Worksheets are per Soil Property, so an Export narrowed to a single property puts every record in one sheet — at a 300,000 cap that is a third of the limit, but a cap near 1,000,000 would sit inside 5% of it. GDAL does not protect against this: writing 1.1M rows to one sheet exits 0 with no warning and emits row 1,100,001, producing a workbook Excel refuses while `ogrinfo` reads it back happily. Any cap raised past ~800,000 needs a per-Soil-Property check added alongside it.
- Only XLSX gets a size limit here. An uncapped `gpkg` or `csv` Export of the same 1.5M records still writes unbounded temp data, and exceeding the pod's ephemeral-storage budget evicts it. That is left unaddressed deliberately: queue heartbeats now surface an eviction as a failed job within minutes instead of wedging it for 24 hours, and no eviction has actually been observed. Revisit with a temp-disk budget if one is.
