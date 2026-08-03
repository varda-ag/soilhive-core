# Data Management Portal

## Introduction

The SoilHive Data Management Portal gives anyone who owns soil data a straightforward way to upload, harmonise, and publish datasets in a standardised, interoperable format, with full control over who can access them.

Soil data has long suffered from fragmentation: datasets produced by different laboratories, projects, and countries rarely share a common vocabulary, unit system, or metadata structure, which makes them difficult to combine, compare, or put to full use for sustainable agriculture.

SoilHive addresses this by guiding users through a step-by-step workflow for loading data into the platform that requires no technical expertise. The workflow maps fields to a standardised vocabulary aligned with existing ontologies (GloSIS and AGROVOC), applies automatic unit conversions, and captures rich analytical metadata, giving every datapoint the context it needs to be genuinely useful for further analysis and decision-making.

### Who Is This Documentation For?

This documentation is intended for:

- Developers extending or integrating with the platform
- Scientists and data managers looking for a reference on the supported vocabulary, metadata schema, and unit conversion rules
- Data contributors uploading and publishing soil datasets

### Getting Started

1. Sign up to the platform.
2. Make sure you've been assigned the **Data Administrator** role. Only users with this role can load data into the platform.
3. Sign in to the platform, navigate to your profile, and select **Admin Console**.
4. Open the **Data Publication** panel.
5. Click **Add a Dataset** in the top-right corner to begin.

The portal walks you through four steps:

1. **General Info** – fill in essential metadata
2. **File/s Upload** – upload your data file(s)
3. **Field Mapping** – map your fields to the SoilHive vocabulary and specify units and analytical methods
4. **Preview** – review, clean, and load your dataset

> **Note:** Data cleaning should ideally be done before upload. The portal supports row-level deletion as a final check but does not yet provide a full cleaning environment.

Once your data is loaded, you can publish it — either publicly or privately to selected users.

All steps are described in detail in the sections below.

---

## How to Upload Data Into the Platform

### General Info — Describe the Dataset

Provide basic descriptive information about the dataset you're about to create. This forms the core of the metadata record; many additional fields are inferred automatically by the system, reducing the amount of manual input required.

The following fields are requested at this stage:

- **Name** — a concise, descriptive name for the dataset.
- **Full Name** — the extended or formal name of the dataset.
- **Description** — a brief description covering content, purpose, methodology, soil properties measured, and temporal and geographic coverage.
- **Author** — the person or organisation responsible for creating the dataset.

### Soil Data — Upload Your File(s)

Upload one or more files to associate with your dataset. All files within the same dataset must share an identical field structure — the same fields and the same data types — and must be loaded together. The platform does not currently support incremental additions to an existing dataset.

**Supported formats**
GeoJSON, GPKG, SHP, CSV, XLSX, GML, KML, and GDB are all accepted, as well as ZIP archives containing any of these formats. Shapefiles must be zipped together with all their associated files (`.dbf`, `.shx`, `.prj`, etc.).

**Specific requirements for each format**

| Format | Requirements |
|---|---|
| **CSV** | Plain-text, comma-separated. Must include either a `latitude`/`longitude` column pair (for point data) or a WKT geometry column (for point or polygon/multipolygon data). First row must be a header row with one column per field. |
| **XLSX** | Same structural requirements as CSV. Only the first sheet is read; additional sheets are ignored. |
| **GeoJSON** | Must be a valid `FeatureCollection`. Each `Feature` must have a `geometry` of type `Point`, `Polygon`, or `MultiPolygon`. Coordinates are assumed to be in WGS 84 (EPSG:4326) unless a `crs` member is specified. |
| **GPKG** (GeoPackage) | Must contain at least one vector layer with point, polygon, or multipolygon geometries. If the file contains multiple layers, the first layer with valid geometries of a supported type is used. |
| **SHP** (Shapefile) | Must be uploaded as a ZIP archive containing all associated files: `.shp`, `.shx`, `.dbf`, and `.prj` (the `.prj` file is required for automatic CRS detection). Geometry type must be Point, Polygon, or MultiPolygon. |
| **GML** | Must validate against a standard GML schema and contain point or polygon geometries with associated feature attributes. |
| **KML** | Point placemarks and polygon features are both supported; each placemark's or polygon's `ExtendedData` fields are mapped as soil property columns. Nested folders are flattened. |
| **GDB** (File Geodatabase) | Must be uploaded as a ZIP archive of the `.gdb` folder. Must contain at least one feature class with point, polygon, or multipolygon geometries. |
| **ZIP** | Used to bundle any of the above formats where multiple files are required (Shapefile, GDB) or simply to reduce upload size. A ZIP must contain exactly one dataset — do not bundle multiple unrelated files together. |

> **Note:** The table above reflects general format requirements. Platform-specific limits (e.g. maximum file size, maximum row count, exact required column names) should be confirmed and added here before publishing.

**What your file should contain**

A geometry field, or separate latitude and longitude columns, is required — the platform only supports geo-located data. Beyond that, the following are strongly recommended:

- Sampling date, in `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` format
- Depth, as upper and lower values in centimetres, either in separate columns or as a single depth range value with the upper and lower bounds separated by a dash (e.g. `10-15` or `10 cm - 15 cm`)
- License at the record level, if individual observations carry different licenses (if the whole dataset shares a single license, it can instead be set as a fixed value in a later step — see the [list of supported licenses](6-license_options.csv))
- Soil properties, each in its own column: one column per property, unit, and analytical procedure

> **Note:** If sampling date, depth, or license are not present in the file, fixed values can be applied at the dataset level in a later step.

**Coordinate Reference System**

After upload, the system will ask you to specify the coordinate reference system of your file if it can't be detected automatically — this is typically only needed for formats like CSV and XLSX, where the CRS isn't always embedded.

SoilHive stores all spatial data in EPSG:4326 (WGS 84). If your file uses a different CRS, the platform will reproject it automatically. For most file formats the CRS is detected without any input; you only need to specify it manually if the system can't determine it from the file.

### Field Mapping — Match Your Data

This is the first harmonisation step. It's required to align the property names in your dataset with a common, shared vocabulary, and to determine which conversion formula should be applied to transform each value into its standard unit of measurement. The system reads all fields in your file and attempts to map them automatically using field-name matching.

The following structural fields are recognised automatically when they follow commonly used naming conventions: latitude, longitude, geometry, minimum and maximum depth or depth range, sampling date, license, and horizon. If a field name doesn't match a recognised convention, you'll need to map it manually.

For soil property fields, you complete the mapping manually by selecting the matching property from the SoilHive vocabulary (see [Soil Property Vocabulary](4b-soil-property-vocabulary.md)) and specifying the original unit. The platform then determines the standard unit and records the conversion rule automatically (see [Unit Conversion Reference](5a-unit-conversion-reference.md)).

Any field left unmapped will not be loaded into the platform.

**Analytical Methodology (optional)**

For each mapped property, you can expand the methodology panel to record how the value was produced:

- **Sample pre-treatment** — physical or chemical preparation applied before analysis
- **Technique** — Lab procedure (physical or chemical analysis), Spectral (NIR or MIR), or Calculated (derived from formulas, statistical models, or process-based models)
- **Laboratory method** — the named protocol used
- **Extractant concentration** — concentration of the extraction solution
- **Extraction ratio** — soil-to-solution ratio
- **Extraction base** — mass/mass, volume/mass, or volume/volume
- **Measurement procedure** — instrument or procedure used to determine the value
- **Limit of detection** — the lowest concentration reliably distinguishable from zero

See [Analytical Methodology Vocabulary](4d-analytical-methodology-vocabulary.md).

### Preview — Review Data

Your data may be subject to modification, and some data may be discarded if it doesn't comply with SoilHive's data quality rules. Before your data is loaded into the platform, an automatic cleaning step runs to standardise values and flag records that can't be safely loaded. A summary of everything the cleaning step did is shown above the preview table, broken down into three categories: **Modified values**, **Discarded rows**, and **Discarded cells**.

**Modified values**

| What happens | Shown in the summary as |
|---|---|
| Depth values are rounded to the nearest whole number (e.g. 10.4 cm becomes 10 cm) | *Depth rounded to integer* |
| Soil property values are rounded to a maximum of 3 decimal places | *Value rounded to 3 decimal places* |
| Soil property values are converted to SoilHive's standard unit, based on the original unit you specified in Field Mapping | *Converted to standard unit of measurement* |

**Discarded rows** — an entire row is removed when:

| What happens | Shown in the summary as |
|---|---|
| Geometry contains a different type with respect to the dominant data type (e.g. 18 Point rows and 2 Polygon rows: 2 are discarded) | *Mixed geometry type* |
| Coordinates fall outside the valid range for latitude (−90 to 90) or longitude (−180 to 180) — for polygon or multipolygon geometries, this is raised if any vertex falls outside these ranges (see [criteria](https://postgis.net/docs/using_postgis_dbmanagement.html#Valid_Geometry))| *Invalid coordinates (out of range)* |
| The upper depth is greater than or equal to the lower depth (e.g. 30–0 cm) or the depth range column is not properly formed (e.g. 0-20-30 cm) | *Invalid depth interval (upper ≥ lower or invalid range)* |
| After all other cleaning steps, the row no longer has both a valid location and at least one valid soil property value | *Minimum data requirement not met (missing geometry or invalid soil property value)* |
| The row exactly duplicates another row already in the dataset (same coordinates, date, depth, and value for every property) | *Duplicate row (same coordinates, date, depth, value across all properties)* |
| You manually removed the row yourself during the preview step | *User discarded row* |

**Discarded cells** — a single value within a row is removed (treated as missing) when:

| What happens | Shown in the summary as |
|---|---|
| The value isn't numeric (e.g. text was entered in a numeric field) | *Invalid property value (non-numeric)* |
| The value is negative | *Negative value* |
| The value is exactly zero, which SoilHive treats as no measurement rather than a true zero reading | *Zero value (treated as null)* |
| The value is a percentage above 100% | *Out-of-bounds value* |
| The value is exactly −999, the recognised "below limit of detection" convention | *Below limit of detection* |

You can review exactly which rows and cells were affected directly in the preview table, and you can delete additional individual rows yourself as a final quality check before confirming the upload.

**Loading**

Once you're satisfied with the preview, confirm to load the data into the SoilHive database. The system applies all field mappings, coordinate reprojection, and unit conversions defined in the previous steps.

### Publication

Loading your data and publishing it are two separate things. Once the load finishes, the dataset exists in the SoilHive database but no one outside the administrative portal can see it: it does not appear in the search results, on the map, in downloads, or in any statistics. **Publishing is the step that makes a dataset live.**

**Finding your dataset in the list**

Every dataset you have created is listed in the administrative portal, with a status that tells you where it is in the process. Loaded datasets — the ones waiting to be published — are highlighted so they are easy to spot. You can search by name and filter by data type (Point, Polygonal, Raster) and by visibility (Public, Private).

| Status | What it means | What you can do |
|---|---|---|
| **Draft** | The dataset was created but the upload wizard was never completed | Edit (resumes the wizard at the furthest step you reached), Delete |
| **Loading** | The file is being processed and loaded | Wait for it to finish |
| **Loaded** | The data is in the database but is not visible to users | **Publish**, Delete |
| **Published** | The dataset is live | Edit (opens the settings page), Delete |

If something went wrong during loading, the row is marked with a warning icon and an **Error details** link that opens a summary of what failed and how to fix it. Deleting a dataset requires the delete entitlement, so the bin icon is not shown to every administrator.

**The Publish button — dataset settings**

Clicking **Publish** on a Loaded dataset opens the *Dataset settings* page. Nothing is published until you confirm from this page, and the page has two sections.

*1. Metadata preview*

The **Check your metadata** link opens the dataset's public metadata page in a new tab. As an administrator you can edit each field directly on that page, one at a time.

The metadata page is always visible to everyone, **even when the dataset is private**. That is intentional: people can discover that the data exists and see how it was produced, and then request access. Only the data itself is restricted.

Publishing is blocked until every mandatory metadata field is filled in — the **Publish** button stays disabled and a warning tells you what is missing. The mandatory fields are:

| Mandatory metadata | Notes |
|---|---|
| Name, Full name, Version, Description, Author | Name, Full name, Description and Author are collected in the General Info step; Version and the fields below are edited on the metadata page |
| Citation | How the dataset should be cited by whoever uses it |
| GIS data type | Point, Polygonal or Raster |
| Spatial resolution | Raster datasets only |
| Min and max soil depth | The depth range covered by the dataset |
| Reference coverage start and end | The period the measurements refer to |
| License | At least one |
| Variables measured | At least one soil property |

*2. Data visibility*

Choose one of the two cards:

| Choice | Who can see the metadata | Who can preview and download the data |
|---|---|---|
| **Public dataset** | Everyone | Everyone, subject to the license terms you specify |
| **Private dataset** | Everyone | Data administrators, plus the users you list explicitly |

Choosing **Private** opens the *Who can access this dataset* panel, where you add the email addresses of the people allowed in. Each address you add is granted preview and download rights on this dataset only. The list is saved as a whole when you publish: whatever is on screen replaces the previous list, so removing an address here revokes that person's access.

> **Note:** Granting access by email only works if your platform signs users in with an identifiable email address. If it doesn't, the panel is disabled and a warning explains that no one on the list will actually be granted access — a private dataset then stays restricted to data administrators. Contact your platform administrator if per-user access is required.

**Confirming publication**

Press **Publish** to confirm. If the platform has no Terms & Conditions and Privacy Policy configured, a dialog warns you first: a dataset license covers the data, but not how users of the platform may access, use, and handle it. You can either cancel and configure those documents (see the Look & Feel section of the administrative portal) or proceed anyway.

On confirmation the platform sets the status to **Published**, records today's date as the publication date — only the first time, so re-publishing later does not overwrite the original date — saves the access list if the dataset is private, and returns you to the dataset list.

**After publication**

The dataset is now included in everything the consumer portal does: search, map layers, downloads, and the aggregated statistics. Only published datasets are ever returned by these queries.

Publication is not final. Clicking the edit icon on a published dataset takes you straight back to the same settings page, where you can correct metadata, switch between public and private, or change who has access — press **Publish** again to save your changes. There is no separate "unpublish" action: to withdraw a dataset from circulation, either switch it to private or delete it.
