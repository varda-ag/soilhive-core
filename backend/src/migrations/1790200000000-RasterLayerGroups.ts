import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Layer groups: every footprint points at the set of layers that reference it, so filterRaster
 * resolves AOI → layers through ~1K group rows instead of millions of raster_layer_footprints rows
 * (see ADR-0046). Idempotent (IF NOT EXISTS throughout).
 *
 * Existing footprints are not grouped here, to keep the migration short: run
 * backend/src/scripts/backfill-raster-layer-groups.sql right after it. Until then filterRaster
 * does not see footprints that predate the migration.
 */
export class RasterLayerGroups1790200000000 implements MigrationInterface {
  name = 'RasterLayerGroups1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layer_groups" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "layer_ids_hash" text NOT NULL,
        CONSTRAINT "PK_raster_layer_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_raster_layer_groups_layer_ids_hash" UNIQUE ("layer_ids_hash")
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layer_group_members" (
        "layer_group_id" uuid NOT NULL,
        "raster_layer_id" uuid NOT NULL,
        CONSTRAINT "PK_raster_layer_group_members" PRIMARY KEY ("layer_group_id", "raster_layer_id"),
        CONSTRAINT "FK_raster_layer_group_members_layer_group_id" FOREIGN KEY ("layer_group_id") REFERENCES "raster_layer_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_raster_layer_group_members_raster_layer_id" FOREIGN KEY ("raster_layer_id") REFERENCES "raster_layers"("id") ON DELETE CASCADE
      )`,
    );
    // Serves the ON DELETE CASCADE from raster_layers, which would otherwise scan the table per deleted layer.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_raster_layer_group_members_raster_layer_id" ON "raster_layer_group_members" ("raster_layer_id")`,
    );

    await queryRunner.query(`ALTER TABLE "raster_footprints" ADD COLUMN IF NOT EXISTS "layer_group_id" uuid`);
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
           WHERE c.conrelid = 'raster_footprints'::regclass AND c.contype = 'f' AND a.attname = 'layer_group_id'
         ) THEN
           ALTER TABLE "raster_footprints" ADD CONSTRAINT "FK_raster_footprints_layer_group_id"
             FOREIGN KEY ("layer_group_id") REFERENCES "raster_layer_groups"("id") ON DELETE SET NULL;
         END IF;
       END $$`,
    );
    // Serves the trigger's orphan-group cleanup, which runs on every link insert/delete statement.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_raster_footprints_layer_group_id" ON "raster_footprints" ("layer_group_id")`);

    // Keeps groups in step with raster_layer_footprints on every write path (ingest, re-ingest,
    // bulk delete cascades). Statement-level with transition tables: an ingest batch inserts
    // thousands of links in one statement, and each touched footprint is recomputed once for it.
    //
    // The advisory lock serializes concurrent loads that could race on the same group hash. It is
    // keyed by schema, so schemas sharing a database (one per Jest worker) don't queue on each
    // other; the backfill script takes the same key. On DELETE, the row-level
    // delete_orphan_raster_footprints trigger has already run (row-level AFTER triggers fire before
    // statement-level ones), so orphaned footprints are gone and simply drop out of `affected`.
    //
    // Each of those orphan deletes cascades into a 0-row DELETE here, firing this trigger once per
    // orphaned footprint. Those firings return early: otherwise a bulk delete would run the
    // orphan-group scan once per footprint it orphans. The statement that orphaned them fires
    // after its cascades, with the real links, and does the cleanup.
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION refresh_raster_layer_groups() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM changed_links) THEN
           RETURN NULL;
         END IF;

         PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_SCHEMA || '.raster_layer_groups'));

         WITH affected AS MATERIALIZED (
           SELECT rlf.raster_footprint_id AS footprint_id,
                  md5(string_agg(rlf.raster_layer_id::text, ',' ORDER BY rlf.raster_layer_id)) AS layer_ids_hash,
                  array_agg(rlf.raster_layer_id ORDER BY rlf.raster_layer_id) AS layer_ids
           FROM raster_layer_footprints rlf
           WHERE rlf.raster_footprint_id IN (SELECT raster_footprint_id FROM changed_links)
           GROUP BY rlf.raster_footprint_id
         ),
         distinct_sets AS (
           SELECT DISTINCT ON (layer_ids_hash) layer_ids_hash, layer_ids FROM affected
         ),
         -- DO UPDATE rather than DO NOTHING so RETURNING also yields the groups that already existed.
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

         RETURN NULL;
       END $$`,
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_refresh_raster_layer_groups_ins ON raster_layer_footprints`);
    await queryRunner.query(
      `CREATE TRIGGER trg_refresh_raster_layer_groups_ins
       AFTER INSERT ON raster_layer_footprints
       REFERENCING NEW TABLE AS changed_links
       FOR EACH STATEMENT EXECUTE FUNCTION refresh_raster_layer_groups()`,
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_refresh_raster_layer_groups_del ON raster_layer_footprints`);
    await queryRunner.query(
      `CREATE TRIGGER trg_refresh_raster_layer_groups_del
       AFTER DELETE ON raster_layer_footprints
       REFERENCING OLD TABLE AS changed_links
       FOR EACH STATEMENT EXECUTE FUNCTION refresh_raster_layer_groups()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_refresh_raster_layer_groups_del ON raster_layer_footprints`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_refresh_raster_layer_groups_ins ON raster_layer_footprints`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS refresh_raster_layer_groups`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_raster_footprints_layer_group_id"`);
    await queryRunner.query(`ALTER TABLE "raster_footprints" DROP COLUMN IF EXISTS "layer_group_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_group_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_groups"`);
  }
}
