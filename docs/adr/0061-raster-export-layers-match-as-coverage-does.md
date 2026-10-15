# Raster export layers match as coverage does

Coverage (`filterRaster`) lists a Raster Layer when its bbox and valid-data footprint meet the AOI (ADR 0046). The raster export only checked the bbox, so it could write a layer that coverage did not list: one whose bbox reaches the AOI but whose valid pixels do not. It also ignored `data_types`.

The export now resolves its Raster Layers with `matchRasterLayers`, the query the raster rows of `/soil-data` already use (ADR 0045), under coverage's Dataset-level rules: `visibility` applies, and `data_types` admits raster as `isRasterTypeRequested` does. The export's layer count runs the same queries, so the Raster Layer limit and the progress estimate count exactly the layers the export writes.

## Consequences

- An AOI that meets a layer's bbox but none of its footprints exports nothing for that layer, rather than an all-nodata file.
- A Filter with `data_types` that excludes raster, or an empty list, exports no Raster Layers. `/soil-data` still reads an empty list as no constraint.
- Ingestion Status and Entitlements are unchanged: the export still takes the slugs a download check passes, so a Privileged caller still exports unpublished Datasets (ADR 0057).
- The export's layer queries are now cached like the `/soil-data` ones (ADR 0008).
