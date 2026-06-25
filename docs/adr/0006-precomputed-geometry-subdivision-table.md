# Precompute ST_Subdivide pieces in a side table instead of subdividing at query time

Spatial queries against a huge user geometry (e.g. a MultiPolygon spanning half the world) are slow for two reasons: its bounding box makes the GiST index on `features.geom` unselective, and every `ST_Intersects` walks millions of vertices. The cost driver is vertex count, not area — so the previous query-time fix (`ST_Subdivide` in an `aoi_subdivided` CTE, triggered above 7M km²) used the wrong proxy, only covered the coverage path, and re-subdivided the same immutable geometry on every request.

We decided to precompute subdivision at storage time: a `user_geometry_subdivisions` side table (FK → `user_geometries.id`, GiST-indexed) populated for **every** geometry by a DB trigger (running after the existing `ST_MakeValid` trigger, guarded with `OLD.geom IS DISTINCT FROM NEW.geom` so dedup upserts don't re-subdivide), with `max_vertices = 64`. The original `user_geometries` row stays canonical, so `geom_hash` dedup, the `area` column, and the filter junction table are untouched.

## Consequences

- All query paths semi-join the pieces table directly; the `ST_CollectionExtract(ST_Union(ug.geom), 3)` AOI CTE is removed everywhere. Unioning the pieces at query time would dissolve the subdivision edges and rebuild the giant geometry, so it must not be reintroduced.
- A feature overlapped by two user geometries (or on a shared piece edge) matches multiple pieces; every consumer dedups (EXISTS semi-join or `DISTINCT`).
- The dataset `spatial_extent && aoi` prefilter uses `ST_Extent` over the pieces; raster masking clips per piece (the existing `ST_Union` over clipped rasters absorbs duplicates).
- `AREA_THRESHOLD_M2` and the query-time `aoi_subdivided` CTE are deleted; the migration backfills pieces for existing rows.

## Considered options

- **Query-time subdivision everywhere** — zero schema change, but re-pays the multi-million-vertex `ST_Subdivide` (and the AOI `ST_Union`) on every request against immutable, content-addressed geometries.
- **Storing pieces as `user_geometries` rows** — breaks the one-row-per-user-geometry model: `geom_hash` dedup stops matching re-uploads, per-piece `area` is meaningless, and the filter junction fans out.
- **Populating only above a vertex/area threshold** — saves duplicate storage for small geometries but forces a fallback branch in every query forever.
