# Map-Based Filters

A map-based filter is a raster classification layer, such as land cover or soil groups, whose classes users select to narrow their area of interest. Filters are optional. A data-admin installs each one into a running instance.

## Should you install them?

SoilHive works fully without map-based filters. Users just have no land cover, agro-ecological zone or soil group classes to select.

Each filter you install costs:

- **Database space.** The filter is loaded into PostgreSQL and takes several times the size of its compressed GeoTIFF. Land Cover takes several GB.
- **Query time.** A query with selected classes first builds a mask from the filter's pixels, using up to 256 MB of `work_mem` (see [Infrastructure](infrastructure.md)).
- **Licence obligations.** Every filter is third-party data. See [Licences and attribution](#licences-and-attribution).

Turning a filter off, or deleting it, changes saved results. Filters users saved keep the classes they selected, but those classes stop applying, so the saved Filters match as if no class were selected.

## What users see

A filter reaches users once it is installed, labelled and active.

- **The filtering sidebar.** Each filter is a list named after it, with a search box and one checkbox per label.
- **Only the classes in the area.** A list offers only the classes found in the drawn area, and reads *No filter is available* when there are none.
- **What a selection does.** The area of interest becomes the drawn area clipped to the selected classes' pixels: any selected class within one filter, and every filter that has a selection. The narrower area applies to the dataset list and coverage, the Data Availability Index (DAI), the Data Explorer, and exports, whose readme names the filters and classes.

## Adding a filter

A filter is a raster, its labels, and a name.

### Preparing the raster

- Any raster GDAL reads, georeferenced: it has a coordinate reference system and a geotransform.
- **Categorical**: the chosen band holds whole-number classes, in a type of 32 bits or less. Continuous rasters (floating-point values) cannot be installed.
- **Nodata**: unless the raster is already in EPSG:4326, its band must declare a nodata value that is not one of its classes.
- At most `MAX_UPLOAD_SIZE_MB` (5000 MB by default).
- Optionally, its own labels: a raster attribute table, or category names. `POST /files` shows them per band as `category_labels`. Only formats that keep them inside the file, such as ERDAS Imagine `.img`, carry them through the upload. A GeoTIFF keeps both in a `.tif.aux.xml` sidecar, which the upload leaves behind, so label it yourself.

### The labels

- Keys are pixel values, written as plain whole numbers.
- Labels are non-empty text. Several pixel values may share a label, and users then select them together.
- Pixel values left out are never offered, so non-classes such as clouds or no data need no label.
- `{}` removes every label, which hides the filter.

### The name and description

- The name gives the filter its id, once (see [Installing a filter](#installing-a-filter)). A new version of the data is a new filter, so put the version in the name: `Land Cover 2025`.
- Put the source and its attribution in the description. See [Licences and attribution](#licences-and-attribution).

## Installing a filter

1. **Upload the raster** with `POST /files` (multipart). Note the `id` it returns.
2. **Create the filter** with `POST /raster-filters`:
   ```json
   { "name": "Land Cover 2024", "description": "...", "file_id": "<file id>", "band": 1, "kind": "categorical" }
   ```
   The response gives the filter its `id`, derived from the name (`land_cover_2024`), with `_2`, `_3`... added when it is taken. The id names the filter's database table, so it never changes, even when the filter is renamed. `band` is the one band installed, chosen from the upload's `metadata.raster_bands`; the others are discarded. It can be left out for a single-band raster.
3. **Wait for the install.** `GET /raster-filters/{id}` reports `install.status`: `queued`, `installing` (with `progress_percentage`), then `installed` or `failed`. A failure lists its causes and remedies in `install.errors`.
4. **Label it** with `PUT /raster-filters/{id}/mappings` (see [The labels](#the-labels)). When the raster carried its own labels, `suggested_mappings` holds them, for the values it holds, ready to send as the body. A filter is **enabled** once it is installed and labelled.
5. **Activate it** with `PATCH /raster-filters/{id}` and `{ "active": true }`, or with its toggle in the Admin console.

An installed filter cannot be reinstalled: install a new version as a new filter.

## What the install does to your raster

- Keeps the chosen band and discards the others.
- Reprojects it to EPSG:4326 with nearest-neighbour resampling, unless it is already in EPSG:4326, which is copied unchanged.
- Fails without loading anything when the band holds only nodata.
- Loads it into the database with five overviews, and counts its pixel values (`pixel_values`).
- Deletes the uploaded file. A failed install keeps it.
- Leaves the filter inactive and unlabelled.

## Turning installed filters on and off

Whether an installed filter is offered to users is controlled separately by a toggle in the Admin console, or by `PATCH /raster-filters/{id}` with `active`:
1. Open the SoilHive Admin console and go to the **Map-based filters** page
2. Each filter in the **Filter states** list shows whether it is **Installed**, next to a toggle switch
3. Flip the toggle to turn the filter on or off. The change is saved immediately.

Turning a filter off does **not** delete its data. Users see a filter only when it is both active and enabled.

## Deleting a filter

Deactivate it, then call `DELETE /raster-filters/{id}`. This drops its tables. Filters users saved with its classes keep them, but they no longer apply. Its `id` is never used again, so those classes can never select another filter's pixels: a new filter of the same name gets `<id>_2`.

## Licences and attribution

The filters below are third-party data, not covered by SoilHive's licence. Before installing one, check that its licence allows your use, and credit its source:

- **Where your users see the filter**, for example on your instance's about or legal page.
- **In the filter's description**, which the API returns.

| Filter | Source | Licence |
| ------ | ------ | ------- |
| Agroecological zones v4 | FAO & IIASA, GAEZ v4 (2021) | None published for the data. FAO's terms allow private study, research and teaching; other uses need FAO's permission. |
| Agroecological zones v5 | FAO & IIASA, GAEZ v5 (2025) | CC BY 4.0 |
| Land Cover 2019 | Copernicus Global Land Service, LC100 collection 3 (2020) | CC BY 4.0 |
| Land Cover 2024 | Impact Observatory, Microsoft and Esri, 10m Annual LULC (2025) | CC BY 4.0 |
| Soil Groups | FAO & IIASA, HWSD v2.0 (2023) | CC BY 4.0 in FAO's data catalogue, CC BY-NC-SA 3.0 in the v2.0 report |

CC BY 4.0 allows any use, commercial included, as long as the source is credited. This summary reflects what the sources published in October 2026. It is not legal advice: licences change, so check each source's current terms. For permission to use FAO data, write to copyright@fao.org.

## Available filters

GeoTIFF packages are being published and their download links are listed here as they become available. Each filter's labels below, keyed by value.

### Agroecological zones v4

- **Package**: https://static.soilhive.ag/map-based-filters/agroecological_zones_v4.tif (49 MB). 30 arc-seconds (about 1 km), EPSG:4326, nodata 0.
- **Source**: FAO & IIASA, [Global Agro-Ecological Zones v4](https://www.fao.org/gaez/gaezv4/en), the 33-class agro-ecological zones. Data from the [GAEZ v4 data portal](https://gaez-v4-data.fao.org/data/).
- **Licence**: no licence is published for GAEZ v4 data.
  - FAO's [terms of use](https://www.fao.org/contact-us/terms/en/) allow private study, research and teaching, with acknowledgement of FAO as the source and copyright holder.
  - Any other use, commercial use included, needs FAO's permission ([licence request form](https://www.fao.org/contact-us/licence-request/en/)).
  - The GAEZ v4 model documentation is CC BY-NC-SA 3.0 IGO.
  - For other uses, prefer v5.
- **Attribution**: Source: © FAO, 2021. Global Agro-Ecological Zones v4 (FAO & IIASA).
- **Unlabelled values**: the raster also holds classes 32 and 33, which the labels below leave out. Label them from the GAEZ v4 legend if your users need them.
- <details>
  <summary>Mappings</summary>

  | Category | Value |
  | -------- | -------- |
  | Tropical lowland semi-arid | 1 |
  | Tropical lowland sub-humid | 2 |
  | Tropical lowland humid | 3 |
  | Tropical highland semi-arid | 4 |
  | Tropical highland sub-humid | 5 |
  | Tropical highland humid | 6 |
  | Subtropical warm semi-arid | 7 |
  | Subtropical warm sub-humid | 8 |
  | Subtropical warm humid | 9 |
  | Subtropical moderately cool semi-arid | 10 |
  | Subtropical moderately cool sub-humid | 11 |
  | Subtropical moderately cool humid | 12 |
  | Subtropical cool semi-arid | 13 |
  | Subtropical cool sub-humid | 14 |
  | Subtropical cool humid | 15 |
  | Temperate moderate dry | 16 |
  | Temperate moderate moist | 17 |
  | Temperate moderate wet | 18 |
  | Temperate cool dry | 19 |
  | Temperate cool moist | 20 |
  | Temperate cool wet | 21 |
  | Boreal Cold no permafrost dry | 22 |
  | Boreal Cold no permafrost moist | 23 |
  | Boreal Cold no permafrost wet | 24 |
  | Dominantly very steep terrain | 25 |
  | Land with severe soil terrain limitations | 26 |
  | Land with ample irrigated soils | 27 |
  | Dominantly hydromorphic soil | 28 |
  | Desert Arid climate | 29 |
  | Boreal Cold with permafrost | 30 |
  | Arctic Very cold climate | 31 |

  </details>

### Agroecological zones v5

- **Package**: not yet published (37 MB).
- **Source**: FAO & IIASA, Global Agro-Ecological Zoning v5 (April 2025), the *Agro-ecological Zones* layer of [Land and Water Resources - GAEZ v5](https://data.apps.fao.org/catalog/dataset/land-and-water-resources-gaez-v-5).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), per FAO's data catalogue.
- **Attribution**: FAO & IIASA. Global Agro-Ecological Zoning version 5 (GAEZ v5), Land and Water Resources. Licence: CC BY 4.0.
- <details>
  <summary>Mappings</summary>

  | Category | Value |
  | -------- | -------- |
  | Tropics lowland; semi-arid | 1 |
  | Tropics lowland; sub-humid | 2 |
  | Tropics lowland; humid | 3 |
  | Tropics highland; semi-arid | 4 |
  | Tropics highland; sub-humid | 5 |
  | Tropics highland; humid | 6 |
  | Sub-tropics warm; semi-arid | 7 |
  | Sub-tropics warm; sub-humid | 8 |
  | Sub-tropics warm; humid | 9 |
  | Sub-tropics moderately cool; semi-arid | 10 |
  | Sub-tropics moderately cool; sub-humid | 11 |
  | Sub-tropics moderately cool; humid | 12 |
  | Sub-tropics cool; semi-arid | 13 |
  | Sub-tropics cool; sub-humid | 14 |
  | Sub-tropics cool; humid | 15 |
  | Temperate moderate; dry | 16 |
  | Temperate moderate; moist | 17 |
  | Temperate moderate; wet | 18 |
  | Temperate cool; dry | 19 |
  | Temperate cool; moist | 20 |
  | Temperate cool; wet | 21 |
  | Cold no permafrost; dry | 22 |
  | Cold no permafrost; moist | 23 |
  | Cold no permafrost; wet | 24 |
  | Dominantly very steep terrain | 25 |
  | Land with severe soil/terrain limitations | 26 |
  | Land with ample irrigated soils | 27 |
  | Dominantly hydromorphic soils | 28 |
  | Desert/Arid climate | 29 |
  | Boreal/Cold climate | 30 |
  | Arctic/Very cold climate | 31 |
  | Dominantly built-up land | 32 |
  | Dominantly water | 33 |

  Value 255 marks no data: leave it unlabelled.

  </details>

### Land Cover 2019

- **Package**: not yet published (3.6 GB).
- **Source**: Copernicus Global Land Service, Land Cover 100 m, collection 3, epoch 2019 (V3.0.1): 23 classes at 100 m. [doi:10.5281/zenodo.3939050](https://doi.org/10.5281/zenodo.3939050).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution**: Buchhorn, M., Smets, B., Bertels, L., De Roo, B., Lesiv, M., Tsendbazar, N.-E., Herold, M., Fritz, S. (2020). Copernicus Global Land Service: Land Cover 100m: collection 3: epoch 2019: Globe (V3.0.1). Zenodo. https://doi.org/10.5281/zenodo.3939050
- <details>
  <summary>Mappings</summary>

  | Category | Value |
  | -------- | -------- |
  | Shrubs | 20 |
  | Unknown | 0 |
  | Oceans seas | 200 |
  | Snow and ice | 70 |
  | Moss and lichen | 100 |
  | Urban / built up | 50 |
  | Herbaceous wetland | 90 |
  | Open forest mixed | 125 |
  | Closed forest mixed | 115 |
  | Herbaceous vegetation | 30 |
  | Permanent water bodies | 80 |
  | Bare / sparse vegetation | 60 |
  | Open forest deciduous broad leaf | 124 |
  | Open forest evergreen broad leaf | 122 |
  | Open forest deciduous needle leaf | 123 |
  | Open forest evergreen needle leaf | 121 |
  | Closed forest deciduous broad leaf | 114 |
  | Closed forest evergreen broad leaf | 112 |
  | Closed forest deciduous needle leaf | 113 |
  | Closed forest evergreen needle leaf | 111 |
  | Cultivated and managed vegetation / agriculture | 40 |
  | Open forest not matching any of the other definitions | 126 |
  | Closed forest not matching any of the other definitions | 116 |

  </details>

### Land Cover 2024

- **Package**: not yet published (2.6 GB).
- **Source**: Impact Observatory, Microsoft and Esri, [10m Annual Land Use Land Cover (9-class)](https://registry.opendata.aws/io-lulc/), the 2024 map (released June 2025). Documentation: [Impact Observatory global maps](https://www.impactobservatory.com/global_maps).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution**: Impact Observatory, Microsoft and Esri. 10m Annual Land Use Land Cover (9-class), 2024. Licence: CC BY 4.0. https://registry.opendata.aws/io-lulc
- **Unlabelled values**: 10 (clouds) is left out.
- <details>
  <summary>Mappings</summary>

  | Category | Value |
  | -------- | -------- |
  | Water | 1 |
  | Trees | 2 |
  | Flooded Vegetation | 4 |
  | Crops | 5 |
  | Built Area | 7 |
  | Bare Ground | 8 |
  | Snow/Ice | 9 |
  | Rangeland | 11 |

  </details>

### Soil Groups

- **Package**: https://static.soilhive.ag/map-based-filters/soil_groups.tif (25 MB). 30 arc-seconds (about 1 km), nodata 0.
- **Source**: FAO & IIASA, [Harmonized World Soil Database v2.0](https://www.fao.org/soils-portal/data-hub/soil-maps-and-databases/harmonized-world-soil-database-v20/en/) (2023): the dominant soil group of each mapping unit, as WRB 2022 reference soil groups.
- **Pixel values**: each group's two-letter WRB code, with each letter replaced by its ASCII code. `AC` (Acrisols) is 65 and 67, so 6567.
- **Licence**: unclear for v2.0.
  - FAO's [data catalogue](https://data.apps.fao.org/catalog/dataset/fedae0d8-677c-47a7-9049-6cba560e6c0a) lists the HWSD v2 dataset under CC BY 4.0.
  - The v2.0 technical report, and mirrors such as ISRIC's, state CC BY-NC-SA 3.0.
  - Until FAO confirms which applies, treat commercial use as needing FAO's permission.
  - [HWSD v2.2](https://data.apps.fao.org/catalog/dataset/ff5c613c-75bb-46a9-a162-bc728059b465) (2026) is CC BY 4.0, with different pixel codes (1 to 34).
- **Attribution**: FAO & IIASA. 2023. Harmonized World Soil Database version 2.0. Rome and Laxenburg. https://doi.org/10.4060/cc3823en
- **Unlabelled values**: 8782 (`WR`, open water), 7868 (`ND`, no data), 7383 (`IS`) and 78116. None of them is a soil group.
- <details>
  <summary>Mappings</summary>

  | Category | Value |
  | -------- | -------- |
  | Acrisols | 6567 |
  | Alisols | 6576 |
  | Andosols | 6578 |
  | Arenosols | 6582 |
  | Anthrosols | 6584 |
  | Chernozems | 6772 |
  | Calcisols | 6776 |
  | Cambisols | 6777 |
  | Cryosols | 6782 |
  | Fluvisols | 7076 |
  | Ferralsols | 7082 |
  | Glaciers | 7171 |
  | Gleysols | 7176 |
  | Gypsisols | 7189 |
  | Histosols | 7283 |
  | Kastanozems | 7583 |
  | Leptosols | 7680 |
  | Luvisols | 7686 |
  | Lixisols | 7688 |
  | Nitisols | 7884 |
  | Phaeozem | 8072 |
  | Planosols | 8076 |
  | Plinthosols | 8084 |
  | Podzols | 8090 |
  | Regosols | 8271 |
  | Retisols | 8284 |
  | Solonchaks | 8367 |
  | Solonetz | 8378 |
  | Stagnosols | 8384 |
  | Technosols | 8467 |
  | Umbrisols | 8577 |
  | Vertisols | 8682 |

  </details>

## Troubleshooting

- **The install failed.** Read `install.errors` on `GET /raster-filters/{id}`, fix the raster, then delete the filter and create it again. Its upload is kept until then, so the same `file_id` can be reused if the raster itself was fine.
- **`RFI_NOT_GEOREFERENCED`.** The raster lacks a CRS or a geotransform. If it has a geotransform in degrees but no CRS, set one before uploading: `gdal_edit.py -a_srs EPSG:4326 filter.tif`.
- **An error about a missing codec, such as LERC.** The server's GDAL cannot decompress the file. The Docker image reads LERC, but other GDAL builds may not. Re-save the file: `gdal_translate -co COMPRESS=DEFLATE in.tif out.tif`.
- **`POST /files` is refused as too large.** Raise `MAX_UPLOAD_SIZE_MB`, and the body size limit of any reverse proxy in front of the backend.
- **`RFI_DB_LOAD_FAILED`.** The database user needs permission to create tables in the application schema, and the database needs room for the filter, which takes several times the size of its compressed GeoTIFF.
