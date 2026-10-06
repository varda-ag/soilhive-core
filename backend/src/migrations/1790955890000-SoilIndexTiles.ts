import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoilIndexTiles1790955890000 implements MigrationInterface {
  name = 'SoilIndexTiles1790955890000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── soil_index.id ─────────────────────────────────────────────────────────
    //
    // Scored Geometries are numbered 1..n within their Run: the MVT feature id hover highlighting
    // needs, and the key the per-score endpoint reads by (docs/adr/0043). Existing partitions are
    // numbered here; they are never written again, so the numbers are stable.
    await queryRunner.query(`ALTER TABLE "soil_index" ADD COLUMN "id" integer`);
    const partitions: { name: string }[] = await queryRunner.query(
      `SELECT c.relname AS name
       FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
       WHERE i.inhparent = to_regclass('soil_index')`,
    );
    for (const { name } of partitions) {
      await queryRunner.query(
        `UPDATE "${name}" AS scored SET "id" = numbered.id
         FROM (SELECT ctid, row_number() OVER (ORDER BY "metadata"->>'unit_id') AS id FROM "${name}") numbered
         WHERE scored.ctid = numbered.ctid`,
      );
    }
    await queryRunner.query(`ALTER TABLE "soil_index" ALTER COLUMN "id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "soil_index" ADD CONSTRAINT "PK_soil_index" PRIMARY KEY ("run", "id")`);

    // ── soil_index_runs ───────────────────────────────────────────────────────
    //
    // The record of one Soil Index Run and the outcome it reached, read by GET /soil-indexes/{id}
    // once its job is gone (docs/adr/0044). As with data_requests, both outcomes are written, a
    // cancelled Run writes none, and `request` never holds the submitter's identity or privilege.
    // A completed row is written in the same transaction as its partition's ATTACH, so "complete"
    // is one fact; a failed one has no partition and no scores.
    //
    // A completed row also holds what the Run's map tiles need (docs/adr/0043): the extent of its
    // Scored Geometries, and the detail zoom - the first zoom served as raw geometries rather
    // than grid cells. Both are null for a Run that scored nothing. Runs written before this
    // migration have no row, and serve neither a record nor tiles.
    await queryRunner.query(
      `CREATE TABLE "soil_index_runs" (
         "run" uuid NOT NULL,
         "status" text NOT NULL,
         "request" jsonb NOT NULL,
         "message" text,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "completed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "score_count" integer,
         "bounds" geometry(Polygon,4326),
         "detail_zoom" smallint,
         CONSTRAINT "CHK_soil_index_runs_status" CHECK ("status" IN ('completed', 'failed')),
         CONSTRAINT "CHK_soil_index_runs_score_count" CHECK (("status" = 'completed') = ("score_count" IS NOT NULL)),
         CONSTRAINT "CHK_soil_index_runs_empty" CHECK (("bounds" IS NULL) = ("detail_zoom" IS NULL)),
         CONSTRAINT "PK_soil_index_runs" PRIMARY KEY ("run")
       )`,
    );
    // Deleting a config item destroys the Runs attached to it (docs/adr/0044).
    await queryRunner.query(
      `CREATE INDEX "IDX_soil_index_runs_config_id" ON "soil_index_runs" (("request"->>'config_id')) WHERE ("request"->>'config_id') IS NOT NULL`,
    );

    // ── soil_index_tiles ──────────────────────────────────────────────────────
    //
    // Pre-rendered tiles, gzipped MVT, one partition per Run. As with soil_index, a partition is
    // filled standalone and then attached, so an attached partition means pre-rendering is done.
    // Each tile carries the tiling version that rendered it, and only the current one is served:
    // tiles are immutable to clients, so one left from an older version would be cached under
    // the new version's URL for good (docs/adr/0043).
    await queryRunner.query(
      `CREATE TABLE "soil_index_tiles" (
         "run" uuid NOT NULL,
         "z" smallint NOT NULL,
         "x" integer NOT NULL,
         "y" integer NOT NULL,
         "version" smallint NOT NULL,
         "data" bytea NOT NULL,
         CONSTRAINT "PK_soil_index_tiles" PRIMARY KEY ("run", "z", "x", "y")
       ) PARTITION BY LIST ("run")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drops every attached partition with it.
    await queryRunner.query(`DROP TABLE IF EXISTS "soil_index_tiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "soil_index_runs"`);
    await queryRunner.query(`ALTER TABLE "soil_index" DROP CONSTRAINT IF EXISTS "PK_soil_index"`);
    await queryRunner.query(`ALTER TABLE "soil_index" DROP COLUMN IF EXISTS "id"`);
  }
}
