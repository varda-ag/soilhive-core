# Loading Raster Data

Raster data is a gridded surface: one value per pixel, covering a continuous area rather than a set of sampling locations. This page covers everything specific to loading it. The steps common to every dataset (creating it, describing it, uploading the files, and publishing it) are on the [Data Management Portal](1-data-management-portal.md) page.

For raster data the portal walks you through three steps:

1. **General Info** – fill in essential metadata ([common](1-data-management-portal.md#general-info--describe-the-dataset))
2. **File/s Upload** – upload your GeoTIFF(s) ([common](1-data-management-portal.md#soil-data--upload-your-files), with the format requirements below)
3. **Field Mapping** – declare what each band measures

There is no Preview step. Rasters are not cleaned, row-level review does not apply to pixels, and the load itself is long enough to run in the background: pressing **Continue** on the mapping step starts it and returns you to the dataset list, where the status tells you when it's done.

---

## File Requirements

**Format**

GeoTIFF (`.tif`, `.tiff`): unlike vector data, a raster must not be wrapped in a ZIP.

SoilHive decides a file is raster by reading it: it asks GDAL to describe every upload, and a file reporting one or more raster bands takes the raster path. A dataset is either all raster or all vector, so a raster uploaded into a vector dataset is rejected, and the reverse too.

**A plain GeoTIFF is fine**

The file does not have to be a Cloud Optimized GeoTIFF already. If it isn't, the load converts it for you and keeps your original untouched alongside the converted one. Uploading a COG skips that step and makes the load faster.

**Bands**

One band becomes one raster layer, so a multiband file can supply several soil properties at once. Bands are numbered from 1, the same numbering GDAL and QGIS use. Nothing requires you to map every band: bands you leave unmapped are not loaded, which is how uncertainty, count and quality bands are excluded.

### Coordinate Reference System

A raster keeps the coordinate reference system it arrives in. Unlike vector data, it is not reprojected at load: reprojecting resamples every pixel once and irreversibly, for the benefit of outputs that may only ever touch a fraction of the raster. Reprojection happens later, only where an output needs it. The layer's bounding box and footprints are recorded in EPSG:4326 so that spatial search works across datasets, and an export is reprojected only if it asks for a target CRS.

Because the CRS is taken from the file and never overridden, what the upload step shows you depends on what the file itself declares:

| What the file declares | What you see |
|---|---|
| An EPSG code | The code is selected for you, the selector is disabled, and you can continue straight away. If the file declares the wrong code, correct it in the file rather than here. |
| A coordinate system carrying no EPSG code | **Custom CRS detected**. The selector is disabled and you can continue, because the projection is read from the file itself and no entry in the EPSG list could describe it. |
| No coordinate system at all | The selector is empty and you cannot continue until you pick one. Only codes in the list can be picked; if your raster's CRS isn't among them, write it into the file before uploading. |

**Setting a CRS on a raster file**

If a raster arrives with no coordinate system, or with the wrong one recorded, you can write one into the file with GDAL before uploading it:

```sh
gdal_edit.py -a_srs <SRS_DEF> file.tif
```

`<SRS_DEF>` accepts any form GDAL understands: an authority code, a `.prj` file, or a WKT string.

```sh
gdal_edit.py -a_srs EPSG:3035 soil_ph.tif
```

This only labels the pixel coordinates already in the file; it does not move them. Use it when the CRS is missing or recorded incorrectly, including when the portal shows a detected code you know to be wrong, since the selector cannot be used to override what the file says. To actually reproject the data, use `gdalwarp -t_srs` instead, though SoilHive does not need you to.

---

## Field Mapping — Match Your Data

The step is titled **Map layers** for raster datasets, and it does the same job field mapping does for vector data: it says what each measurement is, so values from different providers end up in the same vocabulary and the same units. What differs is what gets mapped.

A vector mapping is a set of *references*: "the column named `ph_h2o` supplies pH, the column named `sample_date` supplies the sampling date". A raster has no columns to point at, so a band mapping carries *literal values* instead: this band is pH, over this depth interval, for this period. Everything a vector file would have supplied per row is stated once for the whole band.

### The mapping table

One row per band, across every file in the dataset. A single-band file is listed under its own name; a multiband file contributes one row per band, labelled `filename.tif (band 2)` and so on.

| Column | What it is |
|---|---|
| **Detected layers** | The file, and the band within it. Read-only. |
| **Map to** | The soil property this band measures, chosen from the [Soil Property Vocabulary](4b-soil-property-vocabulary.md). Leaving it empty means the band is not loaded. |
| **Original Unit** | The unit the pixel values are in. SoilHive determines the standard unit from the property and records the conversion (see [Unit Conversion Reference](5a-unit-conversion-reference.md)). |
| **Min-max depth (cm)** | The depth interval the band describes, as whole centimetres below the surface. Both values are **required** for every mapped band. |

Depths must be whole numbers from 0 to 5000, and the minimum must be below the maximum. `0`–`30` is a valid topsoil interval; `10.5` is not, because a depth is stored as whole centimetres and a fraction could not be kept as written.

At least one band must be mapped before you can continue.

### Per-band details (optional)

Expand a row to record the rest of what SoilHive can store about that band:

- **Laboratory method**: the named protocol behind the values, from the [Analytical Methodology Vocabulary](4d-analytical-methodology-vocabulary.md). This is the only methodology field offered for rasters; the fuller panel available for vector data describes a wet-lab measurement of a sample, which a modelled or interpolated surface does not have.
- **Reference period start** and **stop**: the period the values refer to, as `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (e.g. `1977`, `1977-06`, `1977-06-15`). Both are checked against the calendar. Required before publishing.
- **Layer description**: free prose about this band specifically: where it came from, how it was produced, what its characteristics are.
- **Additional resources**: files to attach to this band's layer, such as a technical manual or a prediction layer. Upload them here (TXT, PDF, DOC, DOCX, TIF, TIFF); each becomes an asset of the layer.

### Starting the load

Pressing **Continue** saves the mapping and starts a single background job for the whole dataset, rather than one per file as the vector flow does. The portal confirms the load has started and sends you back to the dataset list, where the row shows **Loading** and then **Loaded**, or a warning icon with an **Error details** link if something failed.

You can leave the page. The load continues without it.

---

## What the Load Does to Your Raster

The load validates everything before it writes anything, so a mistake in one band's mapping stops the job rather than leaving half the dataset loaded.

**1. Every mapping is read and checked.** Band numbers are checked against the bands each file actually has, along with depths, reference periods, and any file an additional resource points at. The band check uses the metadata recorded at upload, so no file is opened to do it.

**2. Each file is normalised once.** If the file is not already a Cloud Optimized GeoTIFF, or if its pixel values need converting to the property's standard unit, it is rewritten:

- The unit conversion is applied as a single multiplication of every pixel. That is the only form that can be applied to a whole raster, so a conversion that is not a plain multiplication fails the load instead of being approximated.
- Overviews are built by averaging. If any mapped band of the file holds class codes rather than measurements (soil texture classes, for instance), nearest-neighbour is used for the whole file instead, so no overview invents a class that is the average of two others. Whether a band is categorical comes from the soil property you mapped it to, not from anything you set.
- The result is written beside the original file with a `_cog` suffix, and the dataset points at it from then on. Your uploaded file is never deleted or modified.

Normalisation happens once per file, before any of its bands are ingested, because it rewrites the whole file. Doing it per band would redo the same work, and for a unit conversion it would rescale already-scaled pixels.

**3. Each mapped band becomes a raster layer**, recording its soil property, procedure, depth interval, reference period, description, the file's resolution and bounding box, and the band's nodata value.

**4. Each band's footprint is traced.** SoilHive walks the band in tiles and records the outline of the area that actually holds data, reprojected to EPSG:4326. This is what lets a spatial search narrow to the layers that genuinely cover an area of interest instead of opening every raster in the platform. It is by far the longest part of the load, at minutes per band and longer for high-resolution or near-global rasters, which is why the job reports progress while it runs.

**5. Additional resources are attached** to their layers, once every band has been ingested successfully.

**6. Dataset metadata is rolled up** from the layers that were loaded (see below), and the dataset is marked **Loaded**.

### Re-running a load

A raster load is repeatable. Each band's layer is identified by its file and band number, so loading again updates the layer in place rather than creating a duplicate, and every field is refreshed from the current mapping, including clearing a layer description you have since removed from it. A load that failed part-way can simply be retried, and a mapping corrected after a successful load can be applied by running it again.

A re-run costs as much as the first run. Every mapped band is re-read and its footprints retraced; nothing is skipped for having succeeded last time.

The one exception is additional resources, which are only ever added. Removing a resource from a mapping and re-running does not detach it from the layer.

### What the load writes to the dataset

These fields are derived from the loaded layers, and overwrite whatever was there:

| Dataset field | Derived from |
|---|---|
| Number of raster layers | A count of the layers that loaded |
| Soil depth range | The shallowest minimum and deepest maximum across all layers |
| Reference period start and stop | The earliest start and latest stop across all layers |
| Spatial resolution | The **coarsest** layer, so the advertised resolution never overstates the detail available |
| Spatial extent | The combined bounding box of all layers |
| Variables measured | The distinct soil property and procedure pairs across all layers |

Licenses are not derived. A raster has no per-record licence, so licence stays whatever you set on the metadata page.

---

## When a Load Fails

The dataset and its files go back to the unloaded state they were in before the job started, and the row in the dataset list carries an **Error details** link. It names the file and the band at fault and tells you how to fix that specific failure; some of those fixes link back to this page.

These are the conditions a load enforces, and where each one is stated:

| What fails the load | Stated under |
|---|---|
| A file has no band mapping, or its mapping names a band the file does not have | [Field Mapping](#field-mapping--match-your-data) |
| A depth is not a whole number of centimetres from 0 to 5000, or the minimum is not below the maximum | [The mapping table](#the-mapping-table) |
| A reference period is not a real date in `YYYY`, `YYYY-MM` or `YYYY-MM-DD` | [Per-band details](#per-band-details-optional) |
| An additional resource names no uploaded file, or names a URL | [Per-band details](#per-band-details-optional) |
| A band's unit conversion is not a single multiplication of every pixel | [What the load does](#what-the-load-does-to-your-raster) |
| A file cannot be normalised to a Cloud Optimized GeoTIFF | [What the load does](#what-the-load-does-to-your-raster) |

An empty mapping is not a failure. A file whose bands you have all unmapped is skipped, and the rest of the dataset loads.

---

Once the load finishes the dataset is marked **Loaded** and is ready to publish. See [Publication](1-data-management-portal.md#publication). Spatial resolution is a mandatory metadata field for raster datasets, and the load has already filled it in.
