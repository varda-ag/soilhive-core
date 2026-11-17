# Loading Vector Data

Vector data is soil data with one record per sampling location: a point, a polygon or a multipolygon, with the measured soil properties held in columns beside it. This page covers everything specific to loading it. The steps common to every dataset (creating it, describing it, uploading the files, and publishing it) are on the [Data Management Portal](1-data-management-portal.md) page.

For vector data the portal walks you through four steps:

1. **General Info** - fill in essential metadata ([common](1-data-management-portal.md#general-info--describe-the-dataset))
2. **File/s Upload** - upload your data file(s) ([common](1-data-management-portal.md#soil-data--upload-your-files), with the format requirements below)
3. **Field Mapping** - map your columns to the SoilHive vocabulary and specify units and analytical methods
4. **Preview** - review, clean, and load your dataset

---

## File Requirements

**Specific requirements for each format**

| Format | Requirements |
|---|---|
| **CSV** | Plain-text, comma-separated. Must include either a `latitude`/`longitude` column pair (for point data) or a WKT geometry column (for point or polygon/multipolygon data). First row must be a header row with one column per field. |
| **XLSX** | Same structural requirements as CSV. Only the first sheet is read; additional sheets are ignored. |
| **GeoJSON** | Must be a valid `FeatureCollection`. Each `Feature` must have a `geometry` of type `Point`, `Polygon`, or `MultiPolygon`. Coordinates are assumed to be in WGS 84 (EPSG:4326) unless a `crs` member is specified. |
| **GPKG** (GeoPackage) | Must contain at least one vector layer with point, polygon, or multipolygon geometries. If the file contains multiple layers, the first layer with valid geometries of a supported type is used. |
| **SHP** (Shapefile) | Must be uploaded as a ZIP archive containing all associated files: `.shp`, `.shx`, `.dbf`, and `.prj` (the `.prj` file is required for automatic CRS detection). A lone `.shp` is rejected by the upload box. Geometry type must be Point, Polygon, or MultiPolygon. |
| **GML** | Must validate against a standard GML schema and contain point or polygon geometries with associated feature attributes. |
| **KML** | Point placemarks and polygon features are both supported; each placemark's `ExtendedData` fields are mapped as soil property columns. Each KML folder becomes a separate layer, and only the first one with valid geometries of a supported type is used, so split your data across folders only if you intend just the first to load. `.kmz` is accepted too, and read the same way. |
| **GDB** (File Geodatabase) | Must be uploaded as a ZIP archive of the `.gdb` folder. Must contain at least one feature class with point, polygon, or multipolygon geometries. |
| **ZIP** | Used to bundle any of the above formats where multiple files are required (Shapefile, GDB) or simply to reduce upload size. A ZIP must contain exactly one dataset: do not bundle multiple unrelated files together. |

> **Note:** The table above reflects general format requirements. The maximum file size is set by your platform administrator and shown under the upload box.

### What your file should contain

A geometry field, or separate latitude and longitude columns, is required, because the platform only supports geo-located data. Beyond that, the following are strongly recommended:

- Sampling date, in `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` format
- Depth, as upper and lower values in centimetres, either in separate columns or as a single depth range value with the upper and lower bounds separated by a dash (e.g. `10-15` or `10 cm - 15 cm`)
- License at the record level, if individual observations carry different licenses (if the whole dataset shares a single license, it can instead be set as a fixed value in a later step; see the [list of supported licenses](../../backend/docs/data-model/6-license_options.csv))
- Soil properties, either each in its own column (a **wide** file: one column per property, unit, and analytical procedure) or one row per measured value (a **long** file, see below)

> **Note:** If sampling date, depth, or license are not present in the file, fixed values can be applied at the dataset level in a later step.

### Long files

A long file has one row per measured value instead of one column per property. The same location and depth then repeat on several rows:

| geometry | min_depth | max_depth | property | value | unit | laboratory_method |
|---|---|---|---|---|---|---|
| POINT (12.8 42.4) | 0 | 20 | P_OLSEN | 14.2 | mg/kg | Olsen |
| POINT (12.8 42.4) | 0 | 20 | pH_H2O | 6.8 | | |
| POINT (12.8 42.4) | 0 | 20 | OC | 1.84 | % | Walkley-Black |

Such a file needs one column for the value. Other columns may name what the value is:

- a **property code** column, with your own codes for the soil properties;
- a **unit** column;
- a **method code** column;
- one column for each analytical methodology field (see the list under Field Mapping).

A file may also have no property code column, for example a file that holds one soil property only, or a file exported from SoilHive. You then pick one soil property for the whole file, and every value in it is loaded under that property.

Each different combination of property code, unit, method code and methodology values is a **measurement type**, and you map each one as you would map one column of a wide file. A file can hold at most 100 measurement types.

On upload SoilHive reads the first rows of the file and suggests whether it is wide or long, and for a long file which column plays which role. Check the suggestion in Field Mapping.

For a **categorical** soil property, such as a texture class, the value column must hold the class code, which is what SoilHive stores. A file exported from SoilHive has both a `value` column with the code and a `value_label` column with the class name: pick `value` as the value column. Class names in the value column are also accepted, and are converted to their codes during cleaning.

### Uploading multiple files

All files within the same dataset must share an identical field structure (the same fields and the same data types). The first file you upload sets the expected structure; any later file that differs is flagged in the file list, and a dialog shows exactly which fields are missing from it and which extra fields it carries. You cannot continue until every file matches.

### Coordinate Reference System

SoilHive stores all vector data in EPSG:4326 (WGS 84). If your file uses a different CRS, the platform reprojects it automatically on load.

For most formats the CRS is read from the file itself and shown to you as read-only. You only need to pick one manually when the system could not determine it, which is typically the case for CSV and XLSX, where the CRS isn't embedded anywhere. Picking a code overrides whatever was detected, so a file whose CRS was recorded incorrectly can be corrected here.

---

## Field Mapping — Match Your Data

This is the first harmonisation step. It's required to align the property names in your dataset with a common, shared vocabulary, and to determine which conversion formula should be applied to transform each value into its standard unit of measurement. The system reads all fields in your file and attempts to map them automatically using field-name matching.

The following structural fields are recognised automatically when they follow commonly used naming conventions: latitude, longitude, geometry, minimum and maximum depth or depth range, sampling date, license, and horizon. If a field name doesn't match a recognised convention, you'll need to map it manually.

For soil property fields, you complete the mapping manually by selecting the matching property from the SoilHive vocabulary (see [Soil Property Vocabulary](4b-soil-property-vocabulary.md)) and specifying the original unit. The platform then determines the standard unit and records the conversion rule automatically (see [Unit Conversion Reference](5a-unit-conversion-reference.md)).

Any field left unmapped will not be loaded into the platform.

**Analytical Methodology (optional)**

For each mapped property, you can expand the methodology panel to record how the value was produced:

- **Sample pre-treatment**: physical or chemical preparation applied before analysis
- **Technique**: Lab procedure (physical or chemical analysis), Spectral (NIR or MIR), or Calculated (derived from formulas, statistical models, or process-based models)
- **Laboratory method**: the named protocol used
- **Extractant concentration**: concentration of the extraction solution
- **Extraction ratio**: soil-to-solution ratio
- **Extraction base**: mass/mass, volume/mass, or volume/volume
- **Measurement procedure**: instrument or procedure used to determine the value
- **Limit of detection**: the lowest concentration reliably distinguishable from zero

See [Analytical Methodology Vocabulary](4d-analytical-methodology-vocabulary.md).

**Long files**

For a long file you first say which column holds the value, and which hold the property code, the unit, the method code and the methodology fields. SoilHive then lists the measurement types it finds in the file, each with its number of rows and its range of values, and you map each one to a soil property, a unit and an analytical methodology. Where an earlier long file had the same property code, or where a code, unit or methodology value matches the SoilHive vocabulary, the answer is filled in for you to check.

A measurement type you leave unmapped is not loaded, as with an unmapped column of a wide file. Two values of the same measurement type at the same location, depth and date are both kept, on separate rows; a value repeated exactly is kept once.

When you press **Continue**, each file is staged for loading: read, parsed against your mapping, and written to a temporary table before the preview opens.

---

## Preview — Review Data

Your data may be subject to modification, and some data may be discarded if it doesn't comply with SoilHive's data quality rules. Before your data is loaded into the platform, an automatic cleaning step runs to standardise values and flag records that can't be safely loaded. A summary of everything the cleaning step did is shown above the preview table, broken down into three categories: **Modified values**, **Discarded rows**, and **Discarded cells**.

**Modified values**

| What happens | Shown in the summary as |
|---|---|
| Depth values are rounded to the nearest whole number (e.g. 10.4 cm becomes 10 cm) | *Depth rounded to integer* |
| Soil property values are rounded to a maximum of 3 decimal places | *Value rounded to 3 decimal places* |
| Soil property values are converted to SoilHive's standard unit, based on the original unit you specified in Field Mapping | *Converted to standard unit of measurement* |
| Categorical label or alias converted to its code | *Class name converted to its class code* |

**Discarded rows.** An entire row is removed when:

| What happens | Shown in the summary as |
|---|---|
| Geometry contains a different type with respect to the dominant data type (e.g. 18 Point rows and 2 Polygon rows: 2 are discarded) | *Mixed geometry type* |
| Coordinates fall outside the valid range for latitude (-90 to 90) or longitude (-180 to 180). For polygon or multipolygon geometries, this is raised if any vertex falls outside these ranges (see [criteria](https://postgis.net/docs/using_postgis_dbmanagement.html#Valid_Geometry))| *Invalid coordinates (out of range)* |
| The upper depth is greater than or equal to the lower depth (e.g. 30-0 cm) or the depth range column is not properly formed (e.g. 0-20-30 cm) | *Invalid depth interval (upper ≥ lower or invalid range)* |
| After all other cleaning steps, the row no longer has both a valid location and at least one valid soil property value | *Minimum data requirement not met (missing geometry or invalid soil property value)* |
| The row exactly duplicates another row already in the dataset (same coordinates, date, depth, and value for every property) | *Duplicate row (same coordinates, date, depth, value across all properties)* |
| You manually removed the row yourself during the preview step | *User discarded row* |

**Discarded cells.** A single value within a row is removed, and treated as missing, when:

| What happens | Shown in the summary as |
|---|---|
| The value isn't numeric (e.g. text was entered in a numeric field) | *Invalid property value (non-numeric)* |
| The value is negative | *Negative value* |
| The value is exactly zero, which SoilHive treats as no measurement rather than a true zero reading | *Zero value (treated as null)* |
| The value is a percentage above 100% | *Out-of-bounds value* |
| The value is exactly -999, the recognised "below limit of detection" convention | *Below limit of detection* |
| The categorical value is not found in the stored labels, aliases or values from the class mapping | *Not a class of the categorical property* |

**Rows left out of a long file.** Before cleaning, the rows of a long file are turned into one row per location, depth and date. The summary counts the rows of the file left out at that step, which are not in the preview table:

| What happens | Counted as |
|---|---|
| The row has no value | *Rows with no value* |
| The row has no property code | *Rows with no property code* |
| The row's measurement type is not mapped | *Rows of unmapped measurement types* |
| The row repeats the value of another row at the same location, depth, date and measurement type | *Repeated values removed* |

Each row is counted once, under the first reason in this list that applies.

You can review exactly which rows and cells were affected directly in the preview table, and you can delete additional individual rows yourself as a final quality check before confirming the upload.

**Loading**

Once you're satisfied with the preview, confirm to load the data into the SoilHive database. The system applies all field mappings, coordinate reprojection, and unit conversions defined in the previous steps.

When the load finishes the dataset is marked **Loaded** and is ready to publish. See [Publication](1-data-management-portal.md#publication).

A load doesn't change the dataset's status while it runs: the dataset list shows it as **Loading**. If the load fails, the dataset keeps the status it had. Records written before the failure stay in it, and a retry doesn't write them twice. A published dataset is never loaded into, so a failed load never touches published data.

### Loading more files later

A load only processes files that have not been loaded yet. A file that is already loaded is not loaded again, so its records are never duplicated.

Once a file is loaded it no longer appears in the preview and its field mapping can no longer be changed.

To add files to a **published** dataset, open a version of it with **Add files** (see [Adding data to a published dataset](1-data-management-portal.md#adding-data-to-a-published-dataset)). A version uses the dataset's field mapping, read-only, so the files you add must have the same columns. A loaded file's records don't record which file they came from, so a wrong file can't be removed from a version on its own: **Reset version data** removes everything loaded into the version, and then you can remove the file and load the rest again.

> **Note:** Data cleaning should ideally be done before upload. The portal supports row-level deletion as a final check but does not yet provide a full cleaning environment.
