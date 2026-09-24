import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreaIndexAndDataRequests1788969909746 implements MigrationInterface {
  name = 'CreaIndexAndDataRequests1788969909746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── soil_index ────────────────────────────────────────────────────────────
    //
    // The scored output of a Soil Index Run, one row per scored geometry.
    // Partitioned BY LIST on `run` with one partition per Run, created and ATTACHed by the job.
    // No primary key. Rows are anonymous facts read back in bulk by Run and geometry.
    // `geometry` is left unconstrained in type: a scored unit is a Point for some products and a
    // Polygon/MultiPolygon for others.
    await queryRunner.query(
      `CREATE TABLE "soil_index" (
         "run" uuid NOT NULL,
         "soil_index_type" text NOT NULL,
         "geometry" geometry(Geometry,4326) NOT NULL,
         "value" double precision NOT NULL,
         "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
         "year" smallint
       ) PARTITION BY LIST ("run")`,
    );

    // Declared on the parent so Postgres propagates a matching index to every partition.
    await queryRunner.query(`CREATE INDEX "IDX_soil_index_geometry" ON "soil_index" USING GIST ("geometry")`);

    await queryRunner.query(`CREATE INDEX "IDX_soil_index_year" ON "soil_index" ("year")`);

    // ── data_requests ─────────────────────────────────────────────────────────
    //
    // One data request and the outcome its Run reached (docs/adr/0037).
    // Append-only: an identical `request` inserts a new row rather than reusing one.
    // Not deduplicated because the row has no owner and data changes in time.
    // Filters can dedupe (docs/adr/0007) only because they dedupe per owner.
    //
    // No default on `id`: it is always the id of the pg-boss job that ran it, so one
    // identifier addresses the request while the job lives and the row afterwards. Nothing
    // is given up by not generating it here - pg-boss also uses gen_random_uuid(), and the
    // row carries no owner, so those 122 unstructured random bits are the whole of what
    // gates the payload.
    //
    // Timestamps are copied from pg-boss's own timestamptz columns, hence `WITH TIME ZONE`
    // where the rest of this schema uses a bare TIMESTAMP: truncating the offset here would
    // be a lossy copy of a value this table does not originate.
    //
    // `data` is null exactly when the Run failed, which is what the CHECK pins: a completed
    // Run without a payload and a failed Run carrying one are both nonsense. A cancelled Run
    // writes no row at all - cancelling is how a Data Request is destroyed - so `status` has
    // two values and not three.
    await queryRunner.query(
      `CREATE TABLE "data_requests" (
         "id" uuid NOT NULL,
         "status" text NOT NULL,
         "request" jsonb NOT NULL,
         "data" jsonb,
         "message" text,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "completed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         CONSTRAINT "CHK_data_requests_status" CHECK ("status" IN ('completed', 'failed')),
         CONSTRAINT "CHK_data_requests_data_matches_status" CHECK (("status" = 'completed') = ("data" IS NOT NULL)),
         CONSTRAINT "PK_data_requests_id" PRIMARY KEY ("id")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_requests"`);
    // Drops every attached partition with it.
    await queryRunner.query(`DROP TABLE IF EXISTS "soil_index"`);
  }
}
