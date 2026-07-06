## 8. Data Output

When data is downloaded from SoilHive, a ZIP folder appears in the downloads directory. The folder name follows the format `SoilHive_YYYY_MM_DD_HH_MM_SS`, timestamped to the moment of export.

### Folder contents

Inside the ZIP:

- **Point data**, as one file per soil property (or one sheet per property for XLSX format, and one layer per property for GPKG format)
- A **README** covering dataset metadata, file structure, and a link to this technical documentation. The README has a static section describing the platform and format conventions, and a dynamic section that adapts to reflect the specific datasets, properties, and file format included in the download, so the information is always relevant to the data at hand.

> **Note:** Raster data is not yet supported for upload, and raster export is not currently included in the download package. Raster support is planned for a future release.

### Supported formats

Point data is available as CSV, XLSX, GeoJSON, or GeoPackage.

### Point data file structure

All point data files share a consistent column structure regardless of format or soil property:

| Field | Description |
|---|---|
| `geom` | Geometry of the sampling location (WGS84) |
| `dataset_name` | Name of the source dataset |
| `license` | Terms of use associated with the dataset |
| `sampling_date` | Date of sample collection (ISO format: `YYYY-MM-DD`) |
| `min_depth` | Minimum sampling depth (cm) |
| `max_depth` | Maximum sampling depth (cm) |
| `value` | Reported value for the soil property |
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
