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
- Optionally, its own labels: a raster attribute table, category names, or a `CLASSES` metadata item holding the [labels JSON](#the-labels), as SoilHive's raster exports write it. `POST /files` shows them per band as `category_labels`. Only labels kept inside the file survive the upload:
  - ERDAS Imagine `.img` keeps all three inside.
  - A GeoTIFF keeps its attribute table and category names in a `.tif.aux.xml` sidecar, which the upload leaves behind, but keeps `CLASSES` inside. Add it with `gdal_edit.py -mo 'CLASSES={"1":"Clay","2":"Silty Clay"}' filter.tif`.
  - A `CLASSES` set on the file rather than on a band only counts for a single-band file.

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
| Agroecological zones v4 | FAO & IIASA, GAEZ v4 (2021) | CC BY-SA 4.0 |
| Agroecological zones v5 | FAO & IIASA, GAEZ v5 (2025) | CC BY 4.0 |
| Land Cover 2019 | Copernicus Global Land Service, LC100 collection 3 (2020) | CC BY 4.0 |
| Land Cover 2024 | Impact Observatory, Microsoft and Esri, 10m Annual LULC (2025) | CC BY 4.0 |
| Soil Groups | FAO & IIASA, HWSD v2.0 (2023) | CC BY 4.0 in FAO's data catalogue, CC BY-NC-SA 3.0 in the v2.0 report |

CC BY 4.0 allows any use, commercial included, as long as the source is credited. CC BY-SA 4.0 also requires that material you adapt from the data and share, such as a modified raster, carries the same licence. This summary reflects what the sources published in October 2026. It is not legal advice: licences change, so check each source's current terms. For permission to use FAO data, write to copyright@fao.org.

## Available filters

Each filter has a GeoTIFF package under https://static.soilhive.ag/map-based-filters/. Each package carries its labels as `CLASSES` metadata, so the install suggests them in `suggested_mappings`. They are listed below, keyed by value.

### Agroecological zones v4

- **Package**: https://static.soilhive.ag/map-based-filters/agroecological_zones_v4.tif (16 MB). 30 arc-seconds (about 1 km), EPSG:4326, nodata 0.
- **Source**: FAO & IIASA, [Global Agro-Ecological Zones v4](https://www.fao.org/gaez/gaezv4/en), the [Simplified AEZ (Global - ~1 km - 33 classes)](https://data.apps.fao.org/catalog/iso/0bb7237a-6740-4ea3-b2a1-e26b1647e4e0) layer. Data from the [GAEZ v4 data portal](https://gaez-v4-data.fao.org/data/).
- **Licence**: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), per FAO's data catalogue.
- **Attribution**: FAO & IIASA. Simplified AEZ (Global - ~1 km - 33 classes), Global Agro-Ecological Zoning version 4 (GAEZ v4), 2021. Licence: CC BY-SA 4.0.
- **Unlabelled values**: the raster also holds classes 32 and 33, which the labels below leave out. Label them from the legend in the catalogue record if your users need them.
- <details>
  <summary>Mappings</summary>

  | Value | Category |
  | ----- | -------- |
  | 1 | Tropical lowland semi-arid |
  | 2 | Tropical lowland sub-humid |
  | 3 | Tropical lowland humid |
  | 4 | Tropical highland semi-arid |
  | 5 | Tropical highland sub-humid |
  | 6 | Tropical highland humid |
  | 7 | Subtropical warm semi-arid |
  | 8 | Subtropical warm sub-humid |
  | 9 | Subtropical warm humid |
  | 10 | Subtropical moderately cool semi-arid |
  | 11 | Subtropical moderately cool sub-humid |
  | 12 | Subtropical moderately cool humid |
  | 13 | Subtropical cool semi-arid |
  | 14 | Subtropical cool sub-humid |
  | 15 | Subtropical cool humid |
  | 16 | Temperate moderate dry |
  | 17 | Temperate moderate moist |
  | 18 | Temperate moderate wet |
  | 19 | Temperate cool dry |
  | 20 | Temperate cool moist |
  | 21 | Temperate cool wet |
  | 22 | Boreal Cold no permafrost dry |
  | 23 | Boreal Cold no permafrost moist |
  | 24 | Boreal Cold no permafrost wet |
  | 25 | Dominantly very steep terrain |
  | 26 | Land with severe soil terrain limitations |
  | 27 | Land with ample irrigated soils |
  | 28 | Dominantly hydromorphic soil |
  | 29 | Desert Arid climate |
  | 30 | Boreal Cold with permafrost |
  | 31 | Arctic Very cold climate |

  </details>

### Agroecological zones v5

- **Package**: https://static.soilhive.ag/map-based-filters/agroecological_zones_v5.tif (33 MB). 30 arc-seconds (about 1 km), EPSG:4326, nodata 255.
- **Source**: FAO & IIASA, Global Agro-Ecological Zoning v5 (April 2025), the *Agro-ecological Zones* layer of [Land and Water Resources - GAEZ v5](https://data.apps.fao.org/catalog/dataset/land-and-water-resources-gaez-v-5).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), per FAO's data catalogue.
- **Attribution**: FAO & IIASA. Global Agro-Ecological Zoning version 5 (GAEZ v5), Land and Water Resources. Licence: CC BY 4.0.
- <details>
  <summary>Mappings</summary>

  | Value | Category |
  | ----- | -------- |
  | 1 | Tropics lowland; semi-arid |
  | 2 | Tropics lowland; sub-humid |
  | 3 | Tropics lowland; humid |
  | 4 | Tropics highland; semi-arid |
  | 5 | Tropics highland; sub-humid |
  | 6 | Tropics highland; humid |
  | 7 | Sub-tropics warm; semi-arid |
  | 8 | Sub-tropics warm; sub-humid |
  | 9 | Sub-tropics warm; humid |
  | 10 | Sub-tropics moderately cool; semi-arid |
  | 11 | Sub-tropics moderately cool; sub-humid |
  | 12 | Sub-tropics moderately cool; humid |
  | 13 | Sub-tropics cool; semi-arid |
  | 14 | Sub-tropics cool; sub-humid |
  | 15 | Sub-tropics cool; humid |
  | 16 | Temperate moderate; dry |
  | 17 | Temperate moderate; moist |
  | 18 | Temperate moderate; wet |
  | 19 | Temperate cool; dry |
  | 20 | Temperate cool; moist |
  | 21 | Temperate cool; wet |
  | 22 | Cold no permafrost; dry |
  | 23 | Cold no permafrost; moist |
  | 24 | Cold no permafrost; wet |
  | 25 | Dominantly very steep terrain |
  | 26 | Land with severe soil/terrain limitations |
  | 27 | Land with ample irrigated soils |
  | 28 | Dominantly hydromorphic soils |
  | 29 | Desert/Arid climate |
  | 30 | Boreal/Cold climate |
  | 31 | Arctic/Very cold climate |
  | 32 | Dominantly built-up land |
  | 33 | Dominantly water |

  Value 255 marks no data: leave it unlabelled.

  </details>

### Land Cover 2019

- **Package**: https://static.soilhive.ag/map-based-filters/land_cover_2019.tif (2.1 GB). 3.6 arc-seconds (about 100 m), EPSG:4326, nodata 255.
- **Source**: Copernicus Global Land Service, Land Cover 100 m, collection 3, epoch 2019 (V3.0.1): 23 classes at 100 m. [doi:10.5281/zenodo.3939050](https://doi.org/10.5281/zenodo.3939050).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution**: Buchhorn, M., Smets, B., Bertels, L., De Roo, B., Lesiv, M., Tsendbazar, N.-E., Herold, M., Fritz, S. (2020). Copernicus Global Land Service: Land Cover 100m: collection 3: epoch 2019: Globe (V3.0.1). Zenodo. https://doi.org/10.5281/zenodo.3939050
- <details>
  <summary>Mappings</summary>

  | Value | Category |
  | ----- | -------- |
  | 0 | Unknown |
  | 20 | Shrubs |
  | 30 | Herbaceous vegetation |
  | 40 | Cultivated and managed vegetation / agriculture |
  | 50 | Urban / built up |
  | 60 | Bare / sparse vegetation |
  | 70 | Snow and ice |
  | 80 | Permanent water bodies |
  | 90 | Herbaceous wetland |
  | 100 | Moss and lichen |
  | 111 | Closed forest, evergreen needle leaf |
  | 112 | Closed forest, evergreen broad leaf |
  | 113 | Closed forest, deciduous needle leaf |
  | 114 | Closed forest, deciduous broad leaf |
  | 115 | Closed forest, mixed |
  | 116 | Closed forest, not matching any of the other definitions |
  | 121 | Open forest, evergreen needle leaf |
  | 122 | Open forest, evergreen broad leaf |
  | 123 | Open forest, deciduous needle leaf |
  | 124 | Open forest, deciduous broad leaf |
  | 125 | Open forest, mixed |
  | 126 | Open forest, not matching any of the other definitions |
  | 200 | Oceans, seas |

  </details>

### Land Cover 2024

- **Package**: https://static.soilhive.ag/map-based-filters/land_cover_2024.tif (1.3 GB). 3.6 arc-seconds (about 100 m, coarser than the 10 m source), EPSG:4326, nodata 0.
- **Source**: Impact Observatory, Microsoft and Esri, [10m Annual Land Use Land Cover (9-class)](https://registry.opendata.aws/io-lulc/), the 2024 map (released June 2025). Documentation: [Impact Observatory global maps](https://www.impactobservatory.com/global_maps).
- **Licence**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Attribution**: Impact Observatory, Microsoft and Esri. 10m Annual Land Use Land Cover (9-class), 2024. Licence: CC BY 4.0. https://registry.opendata.aws/io-lulc
- **Unlabelled values**: 10 (clouds) is left out.
- <details>
  <summary>Mappings</summary>

  | Value | Category |
  | ----- | -------- |
  | 1 | Water |
  | 2 | Trees |
  | 4 | Flooded Vegetation |
  | 5 | Crops |
  | 7 | Built Area |
  | 8 | Bare Ground |
  | 9 | Snow/Ice |
  | 11 | Rangeland |

  </details>

### Soil Groups

- **Package**: https://static.soilhive.ag/map-based-filters/soil_groups.tif (25 MB). 30 arc-seconds (about 1 km), EPSG:4326, nodata 0.
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

  | Value | Category |
  | ----- | -------- |
  | 6567 | Acrisols |
  | 6576 | Alisols |
  | 6578 | Andosols |
  | 6582 | Arenosols |
  | 6584 | Anthrosols |
  | 6772 | Chernozems |
  | 6776 | Calcisols |
  | 6777 | Cambisols |
  | 6782 | Cryosols |
  | 7076 | Fluvisols |
  | 7082 | Ferralsols |
  | 7171 | Glaciers |
  | 7176 | Gleysols |
  | 7189 | Gypsisols |
  | 7283 | Histosols |
  | 7583 | Kastanozems |
  | 7680 | Leptosols |
  | 7686 | Luvisols |
  | 7688 | Lixisols |
  | 7884 | Nitisols |
  | 8072 | Phaeozem |
  | 8076 | Planosols |
  | 8084 | Plinthosols |
  | 8090 | Podzols |
  | 8271 | Regosols |
  | 8284 | Retisols |
  | 8367 | Solonchaks |
  | 8378 | Solonetz |
  | 8384 | Stagnosols |
  | 8467 | Technosols |
  | 8577 | Umbrisols |
  | 8682 | Vertisols |

  </details>

## Troubleshooting

- **The install failed.** Read `install.errors` on `GET /raster-filters/{id}`, fix the raster, then delete the filter and create it again. Its upload is kept until then, so the same `file_id` can be reused if the raster itself was fine.
- **`RFI_NOT_GEOREFERENCED`.** The raster lacks a CRS or a geotransform. If it has a geotransform in degrees but no CRS, set one before uploading: `gdal_edit.py -a_srs EPSG:4326 filter.tif`.
- **An error about a missing codec, such as LERC.** The server's GDAL cannot decompress the file. The Docker image reads LERC, but other GDAL builds may not. Re-save the file: `gdal_translate -co COMPRESS=DEFLATE in.tif out.tif`.
- **`POST /files` is refused as too large.** Raise `MAX_UPLOAD_SIZE_MB`, and the body size limit of any reverse proxy in front of the backend.
- **`RFI_DB_LOAD_FAILED`.** The database user needs permission to create tables in the application schema, and the database needs room for the filter, which takes several times the size of its compressed GeoTIFF.
