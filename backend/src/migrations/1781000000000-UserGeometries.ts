import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserGeometries1781000000000 implements MigrationInterface {
  name = 'UserGeometries1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);

    await queryRunner.query(
      `CREATE TABLE "user_geometries" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "geom" geometry,
        "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL,
        CONSTRAINT "UQ_user_geometries_geom_hash" UNIQUE ("geom_hash"),
        CONSTRAINT "PK_user_geometries_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_user_geometries_geom" ON "user_geometries" USING GiST ("geom")`);
    await queryRunner.query(`CREATE INDEX "idx_user_geometries_geography" ON "user_geometries" USING gist (((geom)::geography))`);
    await queryRunner.query(`CREATE INDEX "idx_user_geometries_geometry_type" ON "user_geometries" USING btree (st_geometrytype(geom))`);
    await queryRunner.query(`ALTER TABLE "user_geometries" ALTER COLUMN "geom" SET STATISTICS 1000`);

    await queryRunner.query(
      `CREATE TABLE "data_filter_user_geometries" (
        "data_filter_id" uuid NOT NULL,
        "user_geometry_id" uuid NOT NULL,
        CONSTRAINT "PK_data_filter_user_geometries" PRIMARY KEY ("data_filter_id", "user_geometry_id"),
        CONSTRAINT "FK_dfug_data_filter_id" FOREIGN KEY ("data_filter_id") REFERENCES "data_filters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dfug_user_geometry_id" FOREIGN KEY ("user_geometry_id") REFERENCES "user_geometries"("id") ON DELETE RESTRICT
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE IF EXISTS "data_filter_user_geometries"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geometry_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geography"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_geometries_geom"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_geometries"`);
  }
}
