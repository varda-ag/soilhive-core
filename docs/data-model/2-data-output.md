## Data Output

When data is downloaded from SoilHive, a ZIP folder appears in the downloads directory. The folder name follows the format `SoilHive_YYYY_MM_DD_HH_MM_SS`, timestamped to the moment of export.

### Folder contents

Inside the ZIP:

- **Vector data**, as one file per soil property (or one sheet per property for XLSX format, and one layer per property for GPKG format)
- **Raster data**, as one raster per raster layer (see [Raster data file structure](#raster-data-file-structure))
- An **`assets/`** folder, when any exported raster layer has supporting files attached (for example a methodology note or a legend), with one subfolder per raster layer
- A **README** covering dataset metadata, file structure, and a link to this technical documentation. The README has a static section describing the platform and format conventions, and a dynamic section that adapts to reflect the specific datasets, properties, and file format included in the download, so the information is always relevant to the data at hand.

### Supported formats

Vector data is available as CSV, XLSX, GeoJSON, Shapefile, or GeoPackage.

Raster data is available as GeoTIFF or GeoPackage.

When both vector and raster data are exported as GeoPackage, or several raster layers are exported as GeoPackage, they are combined into a single `export.gpkg`, with one table per soil property and one raster table per raster layer.

### Coordinate reference system

By default, vector data is exported in WGS84 (EPSG:4326) and each raster layer in its own native coordinate reference system. When a target coordinate reference system is chosen for the download, both are reprojected to it. Raster values are resampled with nearest neighbour for categorical properties, so that no new class is invented between two others, and bilinear interpolation otherwise.

### Vector data file structure

All vector data files share a consistent column structure regardless of format or soil property:

| Field | Description |
|---|---|
| `geom` | Geometry of the sampling location (WGS84) |
| `dataset_name` | Name of the source dataset |
| `license` | Terms of use associated with the dataset |
| `sampling_date` | Date of sample collection (ISO format: `YYYY-MM-DD`) |
| `min_depth` | Minimum sampling depth (cm) |
| `max_depth` | Maximum sampling depth (cm) |
| `value` | Reported value for the soil property |
| `value_label` | Class name of the value, for categorical soil properties such as USDA texture class (empty otherwise) |
| `unit` | Harmonised unit of measurement |
| `sample_pretreatment` | Physical or chemical preparation applied before analysis |
| `technique` | High-level category describing how the value was obtained |
| `laboratory_method` | Named laboratory protocol or analytical method |
| `extractant_concentration` | Concentration of the extraction solution |
| `extraction_ratio` | Soil-to-solution ratio used during extraction |
| `extraction_base` | Basis of the extraction ratio (mass/mass, volume/mass, or volume/volume) |
| `measurement_procedure` | Instrument, technique, or procedure used to determine the value |
| `limit_of_detection` | Lowest detectable concentration for the method used |

Not all methodological fields are populated systematically — their availability depends on the metadata provided with the original dataset.

The `technique` field classifies how each reported value was derived:

- **Lab procedure** — measured using a laboratory analytical protocol
- **Spectral** — derived from NIR or MIR spectroscopy using calibration models
- **Calculated** — computed from other variables using formulas or statistical models

In Shapefiles, column names are shortened to the format's 10-character limit (for example `value_label` becomes `val_label` and `laboratory_method` becomes `lab_method`).

### Raster data file structure

Each raster layer is exported as a single-band raster, named after the layer it comes from:

```
{dataset}_{soil property}[_{laboratory method}][_{unit}][_{min depth}-{max depth}cm][_{reference period}]_{CRS}
```

For example `my_dataset_250m_bulkdensity_cgcm3_5-15cm_4326.tif` for the 5–15 cm bulk density layer of a dataset named "My Dataset 250m". Names are lower-cased, with spaces and punctuation removed, and parts in brackets appear only when the layer has that information. The CRS part is the EPSG code of the file's coordinate reference system, or `custom` for a projection without one. In a GeoPackage, the same name is used for the raster table.

**Embedded metadata**

Each raster carries the following metadata inside the file, readable with `gdalinfo` or in QGIS under *Layer Properties → Information*:

| Metadata | Description |
|---|---|
| `STATISTICS_MINIMUM`, `STATISTICS_MAXIMUM`, `STATISTICS_MEAN`, `STATISTICS_STDDEV` | Band statistics of the exported pixels: after cropping, masking and any reprojection, not of the whole source layer |
| `STATISTICS_VALID_PERCENT` | Share of pixels holding a value rather than nodata |
| `CLASSES` | For categorical soil properties only: the class name of each code, as JSON, for example `{"1": "Clay", "2": "Silty Clay", …}` |

**Class legend for categorical rasters**

A GeoTIFF of a categorical soil property comes with a legend file next to it, `{name}.tif.aux.xml`. It holds a raster attribute table with one row per class (`VALUE`: the class code, `CLASS`: its name), which GIS tools such as QGIS and ArcGIS use to show class names instead of codes. Keep it in the same folder as the `.tif`. Without it the raster still opens, and the class names remain available in the `CLASSES` metadata. GeoPackage rasters have no legend file, and carry the `CLASSES` metadata only.

**Supporting files**

Files attached to a raster layer are placed in `assets/{raster name}/`, under their original file names. Each layer's folder is self-contained: a file shared by several layers is copied into each of their folders.
