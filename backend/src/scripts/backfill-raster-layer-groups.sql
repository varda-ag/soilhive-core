-- Backfill for migration 1790200000000-RasterLayerGroups (ADR-0043).
--
-- The migration only creates the tables, column and triggers; it does not group the footprints
-- that already exist. Until this runs, those footprints have a NULL layer_group_id and filterRaster
-- doesn't see them, so run it right after the migration on every environment that already has
-- raster data.
--
-- Usage (schema is the env's POSTGRES_SCHEMA):
--   psql "<connection>" -v schema=<schema> -f backend/scripts/backfill-raster-layer-groups.sql
--
-- Idempotent: safe to re-run, e.g. after an interrupted run (the transaction rolls back as a whole).

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path TO :"schema", public;
-- One statement over the whole junction table: no timeout, and enough work_mem that the
-- per-footprint arrays don't spill to disk.
SET LOCAL statement_timeout = 0;
SET LOCAL work_mem = '1GB';

-- The lock refresh_raster_layer_groups takes: a raster load running meanwhile waits for this
-- transaction instead of racing it on the same group hashes.
SELECT pg_advisory_xact_lock(hashtext('raster_layer_groups'));

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
