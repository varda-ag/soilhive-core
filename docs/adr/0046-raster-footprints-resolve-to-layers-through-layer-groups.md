# Raster footprints resolve to layers through layer groups

**Status:** Accepted

## Context

`filterRaster` answers "which raster layers have data inside this AOI". Footprints are deduplicated
by `geom_hash` (ADR 0030), and most footprints are shared by many layers of the same dataset
(>95% shared, 94% by more than 20 layers in production). Going from footprints to layers through the
`raster_layer_footprints` junction therefore multiplies every AOI hit by its layer count. On dev
(195 layers), a 990-piece country AOI touched 12.5M junction rows. The query took 20.2s cold and
7.0s warm, plus a 906MB hash.

Most layers in a dataset share the exact same set of footprints, so the number of distinct layer
sets is small: 1,117 sets cover all 12.5M junction rows on dev.

## Decision

- **Groups table.** `raster_layer_groups` holds one row per distinct set of layers, addressed by
  `layer_ids_hash` (md5 of the sorted layer ids). Its members are in `raster_layer_group_members`.
- **Footprint column.** Every footprint carries `raster_footprints.layer_group_id`: the group
  listing exactly the layers that reference it.
- **Kept in sync by triggers.** Statement-level `AFTER INSERT` / `AFTER DELETE` triggers on
  `raster_layer_footprints` (`refresh_raster_layer_groups`) recompute groups for the footprints
  whose links changed in that statement, then delete groups no footprint references any more. They
  use transition tables, so each one fires once per ingest batch rather than once per row.
- **Serialized.** An advisory lock, keyed by schema, serializes recomputes.
- **Covers every write path.** Ingest, re-ingest and bulk delete cascades keep groups correct with
  no application code.

`filterRaster` runs as a single query:

1. **Bbox pass.** One bitmap scan over `raster_footprints` with `geom && ANY(ARRAY(<aoi pieces>))`
   covers all AOI pieces at once and collects candidate footprint ids per group. It reads only
   `id` and `layer_group_id`, never the geometry.
2. **Exact test, per group.** A `LATERAL ... LIMIT 1` runs the exact test only until the first
   footprint of each group intersects. Footprints are tested against the subdivision pieces
   through their GiST index, or against the single masked geometry when raster filters are
   active.
3. **Layer resolution.** Layers come from `raster_layer_group_members`, intersected with the
   candidate layers that pass the non-spatial filters.

Measured on the same AOI, with the same result (15 datasets, 167 layers):

- **Time:** 3.07s cold, down from 20.2s.
- **Buffer accesses:** 92K, down from 3.4M in the per-footprint exact-test variant.
- **No planner settings needed.**

## Consequences

- **Groups are derived, never written directly.** The triggers are the only writers outside the
  one-off backfill (`backend/src/scripts/backfill-raster-layer-groups.sql`). The migration leaves
  existing footprints ungrouped to stay short, so the backfill must run right after it on every
  environment with raster data. Until then `filterRaster` does not see those footprints.
- **The backfill blocks link writes while it runs.** It takes a `SHARE` lock on
  `raster_layer_footprints` before the advisory lock. With the advisory lock alone, a load that has
  already locked footprint rows deadlocks with the backfill's `UPDATE`, and the whole backfill rolls
  back. Run it with raster loads and raster dataset deletes paused.
- **Mid-reingest visibility.** While a published layer is re-ingested, its links are deleted first.
  Until its footprints are re-inserted, `filterRaster` does not see that layer for them.
- **Concurrent loads wait on each other.** They queue briefly on the advisory lock for each batch.
  Two loads that share footprints across datasets (possible via `geom_hash`, not seen in practice)
  could also deadlock, because footprint row locks are taken before the advisory lock. Postgres
  detects the deadlock and fails one load, which can be re-run.
- **Every link write pays for a recompute.** That includes bulk deletes, where the recompute is
  mostly a no-op because the orphan-footprint trigger has already removed those footprints. Each
  of those orphan deletes also cascades into a 0-row delete on `raster_layer_footprints`, firing
  the trigger once per orphaned footprint. Those firings return before the advisory lock: running
  the orphan-group scan in each made deleting a layer that orphaned 20K footprints take 24.4s
  instead of 0.5s (1K groups).
- **The bbox pass is now I/O-bound** on `raster_footprints` heap pages, because about 1 KB of
  geometry is stored inline per row. Moving geometry out of the main heap (`STORAGE EXTERNAL`,
  or a narrow bbox table) is the next lever if it needs to be faster.

## Considered Options

- **Recompute at the end of `ingestRaster`.** This does the same total work, but only ingest would
  maintain groups: deletes would leave stale hashes, and every future write path would have to
  remember to call it.
- **Join through `raster_layer_footprints` with planner hints** (`enable_nestloop`,
  `enable_indexscan`). Hints were rejected for application code, and the plans they produced
  didn't hold across AOI scales.
- **Per-footprint exact test** (`EXISTS` against the pieces, or against the unioned AOI). This cost
  about 4–7.5s of CPU on ~310K footprints, because PostGIS can't reuse its cached prepared
  geometry when both arguments change on every row.
