# ADR 0045: Raster rows come out of `GET /soil-data`, one per touched pixel

**Status:** Accepted

## Context

A raster Dataset's measurements are the pixels of its Files, one Raster Layer per (File, Band), not Observations. `GET /soil-data` reaches Observations through dataset_layers and features, so it returned nothing for a raster Dataset. A proxy for the legacy API needs pixel values synchronously. Most of its requests are point lookups whose AOI is an H3 res-10 cell (~0.015 km²), smaller than a 250 m or 1 km pixel. It was decided to serve them from `GET /soil-data`, not from a new endpoint and not by having the proxy read the COGs itself.

## Decision

`GET /soil-data` returns **raster rows** next to the vector rows. A raster row has the vector row's shape. It adds `gis_datatype`, which every row now carries, and `resolution_m`, `reference_period_start` and `reference_period_stop`, which are null on vector rows.

- **One row per pixel that touches the AOI.** Any overlap with positive area counts ("all touched"). A pixel-centre rule would return nothing for most point lookups, because the AOI rarely contains a pixel centre. A pixel that meets the AOI only along an edge or at a corner does not count.
- **Nodata pixels are excluded.** A pixel is nodata when it equals `raster_layers.nodata_value`, equals the File's own `GDAL_NODATA` marker, or is NaN. The File's marker is needed because `nodata_value` is an int column: it is null for a Float32 sentinel like -3.4e+38 and rounded otherwise. The marker is read as GDAL writes it, `inf` and `-inf` included. Float32 bands are compared in single precision.
- **A raster row's `sampling_date` is null, and its Raster Layer's reference period is reported instead.** A pixel is usually a prediction covering a period, not a sample taken on a date, and picking one date from the period would misstate it. The Filter's sampling-date criteria already match a Raster Layer's reference period by overlap; the two fields show what they matched.
- **Values are returned exactly as read.** A Float32 pixel written as 6.2869 is reported as 6.286900043487549, the number it widens to, which is what any other reader of the File reports. Rows don't say what type their band is, so a client could not undo a reformatting.
- **Datasets follow the same rules as for vector rows.** A raster Dataset among the requested ones yields raster rows at any Ingestion Status, and the Filter's `visibility` criterion is not applied, exactly as for vector rows (CONTEXT.md, **Published**). Only Visibility and Entitlement gate it, through the existing dataset-level `preview` check. `data_types` is read as the vector rows read it: a list without `raster` excludes raster rows, and an empty list constrains nothing.
- **Within a Dataset, Raster Layers match as they do for coverage (`filterRaster`).** The Layer's bbox and valid-data footprint must meet the AOI, and the Filter's criteria apply as they do to a Raster Layer: soil property, depth and reference-period overlap, and licences. These criteria are now built by one function, `buildRasterLayerCriteria`, used by both paths; it applies `visibility` for coverage only. A Filter without geometries yields no raster rows, as a raster export needs an AOI too. With raster filters, the AOI is the geometries intersected with the selected classes, built the way the export builds it (`getVectorMaskCtes`).
- **Vector rows first, then raster rows, under one cursor.** Raster rows are ordered by Raster Layer id, then pixel row, then pixel column. `sort` orders only the vector rows. A raster row's cursor adds `raster: {layer, row, col}`, the absolute pixel position in its File. A cursor without that field belongs to a vector row, so cursors issued before this change still work. Raster rows fill a page only once the vector rows run out: a page with fewer vector rows than `limit` is topped up from the first raster row, and a raster cursor skips the vector query.
- **A page costs what the page needs, not what the AOI covers.** Pixels are read with geotiff.js windowed reads, through the same storage access the export uses (`openTiff`). Each Raster Layer's pixel window over the AOI is read in row strips of at most 2^20 pixels, and reading stops as soon as the page is full. Up to eight Raster Layers are read at once, so a point lookup over many layers doesn't pay each File's storage round trips in turn. Reading stops when the client disconnects (`requestData.signal`): Postgres cancellation doesn't reach it.
- **A Raster Layer that can't be sampled is logged and skipped.** Causes include a File missing from storage, a rotated grid, or a CRS GDAL can't transform. The page is served without that layer's rows instead of failing, and its vector rows come back too.
- **The all-touched test is computed exactly, not rasterised.** The AOI is reprojected into the Raster Layer's native CRS with `gdaltransform`, keeping the raster in its own CRS (ADR 0026). In pixel space, each row band is intersected with the polygon analytically (`AllTouchedSweep`). Pixel outlines are reprojected back to EPSG:4326 with one batched `gdaltransform` call per CRS per page.

## Considered options

- **Pixel centre inside the AOI.** Rejected: it returns nothing for point lookups, which are the main use.
- **`gdal_rasterize -at`, or `gdalwarp -cutline` with `CUTLINE_ALL_TOUCHED=TRUE`, per Raster Layer.** Rejected. It means one GDAL process per Raster Layer, and per strip, for every page, at 100–450 ms each (ADR 0030). A point lookup over a dataset with dozens of Raster Layers would take seconds, and each request would create temp files. The analytic test implements the same rule without a subprocess, and is checked against a brute-force polygon-overlap test.
- **`sampling_date` set from the reference period when it is a single date.** Rejected: the field would mean two things depending on `gis_datatype`, and a client could not tell a one-year period from a sample taken that year.
- **A dedicated endpoint, or the proxy reading COGs.** Rejected when the feature was decided. The proxy would need its own copy of storage access, Filter semantics and Entitlements.

## Consequences

- Raster coverage and the raster export still list only Published Datasets and apply the `visibility` criterion. So, as with vector data, a raster Dataset that coverage does not list can still be read through `/soil-data` by anyone who holds its slug and passes the Visibility and Entitlement check.
- Raster rows need the `preview` Capability, as vector rows do, while the raster export needs `download`. Before this change `preview` on a private raster Dataset exposed no pixel values. Now it exposes all of them, page by page.
- Raster rows are not the Export Bundle's pixels. The raster export clips with a coarser mask that is roughly pixel-centre, so it can leave out edge pixels that `/soil-data` returns.
- A skipped Raster Layer's rows are missing from the response, and nothing in the response says so. If the failure is transient and the cursor moves past that layer, the pagination loses the layer's remaining rows.
- There is no size limit beyond paging. Memory per request is bounded by eight strips. Time is bounded by how many strips must be read to fill a page, so a huge AOI that is mostly nodata can read many strips for one page.
- GDAL runs only to reproject. A page spawns one `gdaltransform` per distinct projected CRS for the AOI and one for the outlines. A Raster Layer in EPSG:4326 spawns none. A File with no recorded CRS and no EPSG code in its geokeys also costs one `gdalinfo`.
- Only nodata values mark invalid pixels. GDAL mask bands are not consulted, so a File whose invalid pixels are marked only by a mask band has them returned. The loader adds no mask bands.
