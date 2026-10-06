-- Backfill for migration 1790200000000-RasterLayerGroups (ADR-0043).
--
-- The migration only creates the tables, column and triggers; it does not group the footprints
-- that already exist. Until this runs, those footprints have a NULL layer_group_id and filterRaster
-- doesn't see them, so run it right after the migration on every environment that already has
-- raster data.
--
-- Usage (schema is the env's POSTGRES_SCHEMA):
--   psql "<connection>" -v schema=<schema> -f backend/src/scripts/backfill-raster-layer-groups.sql
--
-- Pause raster loads and raster dataset deletes while it runs: it blocks their link writes until it
-- commits, and a load batch that waits past its statement_timeout fails.
--
-- Idempotent: safe to re-run, e.g. after an interrupted run (the transaction rolls back as a whole).

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO :"schema", public;
-- One statement over the whole junction table: no timeout, and enough work_mem that the
-- per-footprint arrays don't spill to disk.
SET LOCAL statement_timeout = 0;
SET LOCAL work_mem = '1GB';

-- Block link writes before taking the advisory lock refresh_raster_layer_groups takes. A load
-- statement locks footprint rows first and only then waits on the advisory lock in its trigger, so
-- holding the advisory lock alone deadlocks with it once the UPDATE below reaches those rows. SHARE
-- mode waits for in-flight link writes to commit and makes new ones wait for this transaction,
-- before they lock any footprint row; reads are not blocked.
LOCK TABLE raster_layer_footprints IN SHARE MODE;
SELECT pg_advisory_xact_lock(hashtext(:'schema' || '.raster_layer_groups'));

-- The trigger's statement, scoped to every footprint instead of changed_links.
WITH affected AS MATERIALIZED (
  SELECT rlf.raster_footprint_id AS footprint_id,
         md5(string_agg(rlf.raster_layer_id::text, ',' ORDER BY rlf.raster_layer_id)) AS layer_ids_hash,
         array_agg(rlf.raster_layer_id ORDER BY rlf.raster_layer_id) AS layer_ids
  FROM raster_layer_footprints rlf
  GROUP BY rlf.raster_footprint_id
),
distinct_sets AS (
  SELECT DISTINCT ON (layer_ids_hash) layer_ids_hash, layer_ids FROM affected
),
upserted_groups AS (
  INSERT INTO raster_layer_groups (layer_ids_hash)
  SELECT layer_ids_hash FROM distinct_sets
  ON CONFLICT (layer_ids_hash) DO UPDATE SET layer_ids_hash = EXCLUDED.layer_ids_hash
  RETURNING id, layer_ids_hash
),
inserted_members AS (
  INSERT INTO raster_layer_group_members (layer_group_id, raster_layer_id)
  SELECT g.id, unnest(s.layer_ids)
  FROM upserted_groups g JOIN distinct_sets s USING (layer_ids_hash)
  ON CONFLICT DO NOTHING
)
UPDATE raster_footprints rf SET layer_group_id = g.id
FROM affected a JOIN upserted_groups g USING (layer_ids_hash)
WHERE rf.id = a.footprint_id AND rf.layer_group_id IS DISTINCT FROM g.id;

-- A separate statement: within the one above, the UPDATE's effects are not yet visible.
DELETE FROM raster_layer_groups g
WHERE NOT EXISTS (SELECT 1 FROM raster_footprints rf WHERE rf.layer_group_id = g.id);

-- Expect footprints_without_group = 0: every footprint has links (orphans are deleted by
-- delete_orphan_raster_footprints), so every one should now belong to a group.
SELECT (SELECT count(*) FROM raster_layer_groups) AS layer_groups,
       (SELECT count(*) FROM raster_footprints) AS footprints,
       (SELECT count(*) FROM raster_footprints WHERE layer_group_id IS NULL) AS footprints_without_group;

COMMIT;

-- A first run rewrites every footprint row. Reclaim the old versions now, rather than leave
-- filterRaster's heap-bound bbox pass (ADR-0043) reading them until autovacuum gets there, and
-- give the planner statistics for layer_group_id. Outside the transaction: VACUUM can't run in one.
VACUUM (ANALYZE) :"schema".raster_footprints;
