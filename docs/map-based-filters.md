# Map-Based Filters

A map-based filter is a raster classification layer (land cover, soil groups...) that users can select classes from to narrow an area of interest. Each one is installed into a running SoilHive instance by a data-admin. Until the Admin console supports installing, use the API with a `data-admin` or `super-admin` token.

## Installing a filter

1. **Upload the raster** with `POST /files` (multipart). Note the `id` it returns.
2. **Create the filter** with `POST /raster-filters`:
   ```json
   { "name": "Land Cover 2024", "description": "...", "file_id": "<file id>", "band": 1, "kind": "categorical" }
   ```
   The response gives the filter its `id`, derived from the name (`land_cover_2024`), with `_2`, `_3`... added when it is taken. The id names the filter's database table, so it never changes, even when the filter is renamed. `band` is the one band installed, chosen from the upload's `metadata.raster_bands`; the others are discarded. It can be left out for a single-band raster.
3. **Wait for the install.** `GET /raster-filters/{id}` reports `install.status`: `queued`, `installing` (with `progress_percentage`), then `installed` or `failed`. A failure lists its causes and remedies in `install.errors`.
4. **Label it** with `PUT /raster-filters/{id}/mappings`, a `{ "pixel value": "label" }` object such as `{ "1": "Water", "2": "Trees" }`. Several pixel values may share a label: users then select them together. `pixel_values` on the filter lists the values its raster holds, with their pixel counts. When the raster carried its own labels (a raster attribute table or category names), `suggested_mappings` holds them, for the values it holds, ready to send as the body. A filter is **enabled** once it is installed and labelled.
5. **Activate it** with `PATCH /raster-filters/{id}` and `{ "active": true }`, or with its toggle in the Admin console.

A new version of a filter's data is a new filter, with a new `id`: an installed filter cannot be reinstalled. Name it after the version (`Land Cover 2025`) so its id says which one it is.

## Preparing the raster

- Any raster GDAL reads, georeferenced: it has a coordinate reference system and a geotransform.
- **Categorical**: the chosen band holds whole-number classes, in a type of 32 bits or less. Continuous rasters (floating-point values) cannot be installed yet.
- **Nodata**: unless the raster is already in EPSG:4326, its band must declare a nodata value that is not one of its classes.
- At most `MAX_UPLOAD_SIZE_MB` (5000 MB by default).
- Optionally, its own labels: a raster attribute table, or category names. `POST /files` shows them per band as `category_labels`. Only formats that keep them inside the file, such as ERDAS Imagine `.img`, carry them through the upload. A GeoTIFF keeps both in a `.tif.aux.xml` sidecar, which the upload leaves behind, so label it yourself in step 4.

## What the install does to your raster

- Keeps the chosen band and discards the others.
- Reprojects it to EPSG:4326 with nearest-neighbour resampling, unless it is already in EPSG:4326, which is copied unchanged.
- Loads it into the database with five overviews, and counts its pixel values (`pixel_values`).
- Deletes the uploaded file. A failed install keeps it.
- Leaves the filter inactive and unlabelled.

## Turning installed filters on and off

Whether an installed filter is offered to users is controlled separately by a toggle in the Admin console, or by `PATCH /raster-filters/{id}` with `active`:
1. Open the SoilHive Admin console and go to the **Map-based filters** page
2. Each filter in the **Activate the filters** list shows whether it is **Installed**, next to a toggle switch
3. Flip the toggle to turn the filter on or off. The change is saved immediately.

Turning a filter off does **not** delete its data. Users see a filter only when it is both active and enabled.

## Deleting a filter

Deactivate it, then call `DELETE /raster-filters/{id}`. This drops its tables. Filters users saved with its classes keep them, but they no longer apply. Its `id` is never used again, so those classes can never select another filter's pixels: a new filter of the same name gets `<id>_2`.

## Available filters

Their GeoTIFF packages are being republished for the API install; download links will be listed here. Each filter's labels below, keyed by value, are the body of its `PUT /raster-filters/{id}/mappings` request.

- Agroecological zones v4 (49 MB)
  - https://static.soilhive.ag/map-based-filters/agroecological_zones_v4.tif
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
- Agroecological zones v5 (37 MB)
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
    | No Data | 255 |

    </details>
- Land Cover 2019 (3.6 GB)
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
- Land Cover 2024 (2.6 GB)
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
- Soil Groups (25 MB)
  - https://static.soilhive.ag/map-based-filters/soil_groups.tif
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
- **`POST /files` is refused as too large.** Raise `MAX_UPLOAD_SIZE_MB`, and the body size limit of any reverse proxy in front of the backend.
- **`RFI_DB_LOAD_FAILED`.** The database user needs permission to create tables in the application schema, and the database needs room for the filter, which takes several times the size of its compressed GeoTIFF.
