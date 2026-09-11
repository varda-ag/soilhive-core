import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreaIndexAndDataRequests1788969909746 implements MigrationInterface {
  name = 'CreaIndexAndDataRequests1788969909746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── crea_index ────────────────────────────────────────────────────────────
    //
    // The scored output of a `crea-index` Run, one row per scored geometry. Until now that
    // output lived in the pg-boss `job.data` jsonb, which is what forced the Aggregation Unit
    // cap docs/adr/0021 is about; the cap does not apply to this type any more, so the output
    // needs somewhere it can be large. See docs/adr/0030.
    //
    // Partitioned BY LIST on `run` with one partition per Run, created and ATTACHed by the job
    // itself — the parent is deliberately left with no partitions here. A Run writes once and is
    // then read-only, so the partition boundary is also the retirement boundary: discarding a Run
    // is a DROP TABLE rather than a bulk DELETE over an unbounded row count.
    //
    // `run` is a pg-boss job id and carries no foreign key: pg-boss lives in a separate schema
    // (`${POSTGRES_SCHEMA}_pgboss`) and deletes its job rows on its own retention timer, so the
    // referent is guaranteed to disappear while these rows remain. It is also a v4 uuid
    // (`gen_random_uuid()`), i.e. random — which is why LIST, not RANGE: there is no ordering in
    // the key to range over, and no timestamp in it to sweep by either. Retention is deferred and
    // is real debt, recorded in docs/adr/0030.
    //
    // No primary key. Rows are anonymous facts read back in bulk by Run and geometry, never
    // addressed individually; a surrogate key would cost 16 bytes and an index per row for a
    // handle nothing holds. Anything needed to trace a row back to the area it scored goes in
    // `metadata`, which is why that column is NOT NULL rather than an optional extra.
    //
    // `geometry` is left unconstrained in type: a scored unit is a Point for some products and a
    // Polygon/MultiPolygon for others, so the type modifier cannot say which without excluding
    // one. The SRID is constrained, because 4326 is not negotiable anywhere in this schema.
    await queryRunner.query(
      `CREATE TABLE "crea_index" (
         "run" uuid NOT NULL,
         "geometry" geometry(Geometry,4326) NOT NULL,
         "value" double precision NOT NULL,
         "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
       ) PARTITION BY LIST ("run")`,
    );

    // Declared on the parent so Postgres propagates a matching index to every partition. A
    // partition that is built standalone and then ATTACHed should create this index *before* the
    // ATTACH, otherwise the ATTACH itself pays for the build while holding its lock.
    await queryRunner.query(`CREATE INDEX "IDX_crea_index_geometry" ON "crea_index" USING GIST ("geometry")`);

    // ── data_requests ─────────────────────────────────────────────────────────
    //
    // One answered data request and the payload that answered it, kept because the pg-boss job
    // that produced it is deleted on retention. Append-only: an identical `request` inserts a new
    // row rather than reusing one, so this is a record of answers given, not a cache. See
    // docs/adr/0031.
    //
    // `gen_random_uuid()` and not the `uuidv7()` used everywhere else in this schema, on purpose.
    // The row carries no owner, so the id is the only thing gating the payload — a bearer
    // capability. uuidv7 embeds a millisecond timestamp and a counter, making ids minted near each
    // other correlated and partly predictable; v4 is 122 unstructured random bits.
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
