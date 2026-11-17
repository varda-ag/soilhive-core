# Long vector files are pivoted to wide at staging

**Status:** Proposed

The vector loader took wide files only: one column per Soil Property, with the property, unit and Procedure fixed per column by the column mapping. Files with one row per measured value could not be loaded, and neither could the files of an Export Bundle, which are long and split per property. A long File is now staged as it is by a `long-stage` job, and `file-to-db` pivots it into the same `file_<id>_raw` table a wide File gets, with one column per **Measurement Type**: a distinct combination of local property code, unit and procedure values. The column mapping gains one reserved key, `long_format`, which names the role columns and gives each Measurement Type the user maps a Soil Property, a unit conversion and a Procedure. A Measurement Type left unmapped is not loaded, as with an unmapped column of a wide File. Cleaning, the Preview table and the Bulk Load read the pivoted table and do not change.

The shape is suggested at upload from a sample of rows (`detected_format`: `wide` or `long`), and the upload queues `long-stage` itself when the suggestion is `long`. A long File need not name its Soil Property in the data: when no column holds a property code, the user sets one Soil Property for the whole File (`fixed_property_id`), and every Measurement Type uses it. An exported file is loaded this way, with no handling of its own.

## Considered options

- **Read long rows in cleaning, preview and load**: rejected. The cleaning CTE, the preview query, the outlier review and `rawRecordToDataModel` all build one expression per property column, so each would need a second path.
- **Pivot inside `ogr2ogr`**: rejected. The Measurement Types are not known until the whole File is read, and the user maps them before the pivot.
- **List the Measurement Types with a distinct query on the File, without staging**: rejected. It costs the same full read as staging, and every change of a role column would read the File again. On the staged table it is one `GROUP BY`.
- **Start `long-stage` when the user confirms the shape**: rejected. A wrong suggestion costs one staging table, and waiting for a click delays every right one.
- **Detect exported files as a format of their own**: rejected. A File with no property column can come from any source, so one rule covers them all: the user sets the property for the File.
- **Read the File's property from its file or layer name**: rejected. A name is a guess, and picking one property is a single choice for the user.
- **Add a `soil_property` column to `EXPORT_SCHEMA`**: rejected. The export format stays as it is.
- **A Load switch per Measurement Type, with every one mapped or skipped before the user can continue**: rejected. A wide File leaves unmapped columns out without asking, and a long File now does the same with unmapped Measurement Types. The mapping needs no skip flag.
- **New values in `RowDeleteReason` for rows the pivot removes**: rejected. Those counts are in source rows and the cleaning report counts pivoted rows, so `rows_deleted` would mix two units. The pivot reports them in a block of its own.
- **Call it a series**: rejected. It reads as a time series and says nothing about soil data.

## Consequences

- `record_id` of a long File is a row number of the source, not the OGR FID of the pivoted table: the first row of its group, or for an extra row the first row that put a value on it. It is worked out over every row, before unmapped Measurement Types are removed, so `drop_records` survive a second `file-to-db` run and a change of which Measurement Types are mapped.
- Rows are grouped by geometry, depths, sampling date, license and horizon. A second value for the same Measurement Type in one group goes to an extra row; an exact repeat is removed and counted.
- A File holds at most 100 Measurement Types, since each is a column of the staging table and of every preview query.
- A File with one value column and no unit or procedure columns is still suggested as wide: it is a wide File with one property column, and loads as before.
- Only the first layer of a File is read, as before, so a File with one property per layer loads the first one only.
- Changing the geometry, latitude, longitude or CRS of a long File runs `long-stage` again; changing any other role only lists the Measurement Types again.
- A Measurement Type present in the staged rows but absent from the mapping is not loaded and raises no error, whether the user left it unmapped or the File was staged again with new codes. Its rows are counted in the pivot's report, which is the only place the loss shows.
- A mapping must hold at least one mapped Measurement Type.
- `file_<id>_long` lives until the Bulk Load drops it with the raw table, so a File can be mapped and pivoted again without a second read. A `file-to-db` run that stages the File as wide drops it too, and the daily orphan cleanup drops the ones of Files deleted or loaded.
- The pivot's counts (rows with no value, with no property code, of unmapped Measurement Types, and repeats removed) are stored in the File's metadata as `long_format_stats` when it runs, since the long table may be gone when the preview stats are asked for. They are returned as the `long_format` block of the cleaning report.
- A source column named `long_format` can no longer be mapped to a Soil Property, as with `drop_records`. The key is not `long`, which is a common name for a longitude column.
- `long-stage` and the `file-to-db` of the same File refuse to run while the other does: one writes `file_<id>_long` and the other reads it.
