# DAI: AOI resolved in-DB from persistent geometry subdivisions, no Node-side geometry and no ephemeral UserGeometry

Until now `computeDai` materialised the AOI in Node: it loaded **all** of a Filter's geometries as GeoJSON (a country-sized MultiPolygon in full, on every cache miss), unioned them with `turf.union`, clipped to the viewport with `turf.intersect`, and shipped the result back to the database — as the `$1` seed of the precomputed path, or via `insertUserGeometry` (insert + `ST_Subdivide` trigger + delete) on the live path. The database already held everything needed: the canonical geometries, their GiST-indexed pieces in `user_geometry_subdivisions` (ADR 0006), and faster, more robust GEOS clipping than turf. We now resolve the AOI entirely in SQL: both DAI paths receive the Filter's **persistent** `geometryIds` plus the viewport envelope, and their `aoi` CTE clips the stored subdivision pieces directly —

```sql
SELECT ST_CollectionExtract(ST_Intersection(ugs.geom, ST_MakeEnvelope(…, 4326)), 3) AS geom
FROM user_geometry_subdivisions ugs
WHERE ugs.user_geometry_id = ANY($1::uuid[])
  AND ST_Intersects(ugs.geom, ST_MakeEnvelope(…, 4326))
```

— falling back to a bare `ST_MakeEnvelope` seed when the Filter has no geometries (which previously *also* paid the insert). No geometry crosses the wire in either direction, DAI GETs stop writing to `user_geometries` entirely, and `@turf` leaves `FilterService`.

- **AOI area becomes an upper-bound approximation: `min(bboxArea, filter.area)`.** The exact clipped area (previously the inserted row's generated column / `turf.area`) no longer exists anywhere in Node, but it is only used to pick the raster-overview tier (`selectOverviewTable`), and it is needed *before* SQL construction. Both bounds are already in hand (`getFilterById` returns `SUM(ug.area)`; the bbox area is arithmetic), the bound is exact in the two common extremes (viewport inside geometry, geometry inside viewport), and overestimating merely selects a coarser overview. Do not "fix" this with an exact `ST_Area(ST_Intersection(…))` pre-query — that re-does the clip work in a second round trip on the hot path for a tier decision that tolerates approximation.
- **The `aoi` CTE is now multi-row in the precomputed path too.** Its consumers already tolerate piece rows (`GROUP BY f.id` in `candidate_features`, `SELECT DISTINCT` in `aoi_features`, per-piece `ST_Clip` + `ST_Union` in the raster CTEs; the `getVectorMaskCtes` chain collapses to one row itself). The one consumer that assumed a single row — `getDaiPointDataPrecomputed`'s non-masked branch — gets `SELECT DISTINCT ON (feature_id)`, guarding centroids that sit exactly on a shared subdivision edge without collapsing distinct coincident features. Keep the JOIN + DISTINCT shape rather than EXISTS: an EXISTS semi-join pins the feature table as outer and falls back to a seq scan (same reasoning as `filterVector`).
- **The DAI result cache stays at the service boundary** (`getDai`'s `cachedCompute`, key `dai:{filterId}:{bbox}:{resolution}`), but its old justification — the live path bound an ephemeral UUID no SQL-derived key could ever hit — is obsolete: the SQL now binds stable inputs and `cachedQuery` *would* work. The service cache is kept because it also caches the H3 binning, and its key is complete under Filter immutability (ADR 0007).

## Consequences

- A Filter geometry touching the viewport only along an edge now yields an empty polygonal AOI (zero CTE rows) instead of `turf.intersect → null`; both end in the same zero response through `computeDai`'s empty-cells branch — there is no Node-side early return anymore, just a cheap indexed query that matches nothing.
- The subdivision trigger's remaining purpose is Filter creation: `insertUserGeometry` is no longer on any read path. It keeps its dedup/hash contract unchanged.
- DAI correctness now depends on `user_geometry_subdivisions` being populated for all Filter geometries (already true — the live path read them before, via the ephemeral row; stale schemas rebuilt per SP-5286 notes).
- Cell scores can shift marginally against old baselines: GEOS clipping replaces turf's clipper, so borderline features on the viewport edge may flip in or out. The perf runner (`src/scripts/perf/runner.ts`, `dai` endpoint) measures the before/after.

## Considered options

- **Clip in DB but return the clipped AOI GeoJSON to Node** (minimal change, downstream untouched) — removes the big transfer and Node GEOS work, but keeps the insert/subdivide/delete write churn on the live path and a redundant DB→Node→DB hop for a geometry the next statement immediately re-parses.
- **Exact AOI area via pre-query** — rejected above; the tier decision doesn't warrant a second clip.
- **Bbox-only predicate instead of clipping** (`ST_Intersects(f.geom, piece) AND ST_Intersects(f.geom, envelope)`) — equivalent for point features but not for polygonal ones (a polygon can intersect a piece outside the viewport and the viewport outside the geometry without intersecting their intersection), and it leaves `ST_Extent(aoi)` — used for the `ds.spatial_extent` prune and the mask reference raster — spanning the full Filter geometry instead of the viewport.
