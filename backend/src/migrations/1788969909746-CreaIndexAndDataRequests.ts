import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreaIndexAndDataRequests1788969909746 implements MigrationInterface {
  name = 'CreaIndexAndDataRequests1788969909746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── crea_index ────────────────────────────────────────────────────────────
    //
    // The scored output of a `crea-index` Run, one row per scored geometry.
    // Partitioned BY LIST on `run` with one partition per Run, created and ATTACHed by the job.
    // No primary key. Rows are anonymous facts read back in bulk by Run and geometry.
    // `geometry` is left unconstrained in type: a scored unit is a Point for some products and a
    // Polygon/MultiPolygon for others.
    await queryRunner.query(
      `CREATE TABLE "crea_index" (
         "run" uuid NOT NULL,
         "geometry" geometry(Geometry,4326) NOT NULL,
         "value" double precision NOT NULL,
         "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
       ) PARTITION BY LIST ("run")`,
    );

    // Declared on the parent so Postgres propagates a matching index to every partition.
    await queryRunner.query(`CREATE INDEX "IDX_crea_index_geometry" ON "crea_index" USING GIST ("geometry")`);

    // ── data_requests ─────────────────────────────────────────────────────────
    //
    // One answered data request and the payload that answered it.
    // Append-only: an identical `request` inserts a new row rather than reusing one.
    // `gen_random_uuid()` and not the `uuidv7()` used everywhere else in this schema, on purpose.
    // The row carries no owner, so the id is the only thing gating the payload: v4 contains more randomness with respect to v7.
    await queryRunner.query(
      `CREATE TABLE "data_requests" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "request" jsonb NOT NULL,
         "data" jsonb NOT NULL,
         CONSTRAINT "PK_data_requests_id" PRIMARY KEY ("id")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_requests"`);
    // Drops every attached partition with it.
    await queryRunner.query(`DROP TABLE IF EXISTS "crea_index"`);
  }
}
