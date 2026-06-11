import { MigrationInterface, QueryRunner } from 'typeorm';

// See docs/adr/0006-precomputed-geometry-subdivision-table.md
const SUBDIVIDE_MAX_VERTICES = 64;

export class UserGeometries1781000000000 implements MigrationInterface {
  name = 'UserGeometries1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_geometries" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "geom" geometry,
        "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL,
        "area" double precision GENERATED ALWAYS AS (ST_Area(geom::geography)) STORED,
        CONSTRAINT "UQ_user_geometries_geom_hash" UNIQUE ("geom_hash"),
        CONSTRAINT "PK_user_geometries_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_user_geometries_geom" ON "user_geometries" USING GiST ("geom")`);
    await queryRunner.query(`CREATE INDEX "idx_user_geometries_geography" ON "user_geometries" USING gist (((geom)::geography))`);
    await queryRunner.query(`CREATE INDEX "idx_user_geometries_geometry_type" ON "user_geometries" USING btree (st_geometrytype(geom))`);
    await queryRunner.query(`ALTER TABLE "user_geometries" ALTER COLUMN "geom" SET STATISTICS 1000`);

    await queryRunner.query(
      `CREATE TABLE "user_geometry_subdivisions" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_geometry_id" uuid NOT NULL,
        "geom" geometry NOT NULL,
        CONSTRAINT "PK_user_geometry_subdivisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ugs_user_geometry_id" FOREIGN KEY ("user_geometry_id") REFERENCES "user_geometries"("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_user_geometry_subdivisions_geom" ON "user_geometry_subdivisions" USING GiST ("geom")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_geometry_subdivisions_user_geometry_id" ON "user_geometry_subdivisions" ("user_geometry_id")`,
    );
    await queryRunner.query(`ALTER TABLE "user_geometry_subdivisions" ALTER COLUMN "geom" SET STATISTICS 1000`);

    // SET search_path FROM CURRENT pins the migration-time search_path so the
    // unqualified table reference resolves correctly when fired from app sessions.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION subdivide_user_geometry()
      RETURNS trigger AS $$
      BEGIN
        DELETE FROM user_geometry_subdivisions WHERE user_geometry_id = NEW.id;
        INSERT INTO user_geometry_subdivisions (user_geometry_id, geom)
        SELECT NEW.id, ST_Subdivide(ST_CollectionExtract(NEW.geom, 3), ${SUBDIVIDE_MAX_VERTICES})
        WHERE NEW.geom IS NOT NULL AND NOT ST_IsEmpty(ST_CollectionExtract(NEW.geom, 3));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SET search_path FROM CURRENT
    `);

    // Geometries are canonicalised (ST_MakeValid) by insertUserGeometry before they
    // reach this table, so NEW.geom is always valid (ST_Subdivide requires valid
    // input). Validation must NOT happen in a trigger here: ST_MakeValid is not
    // byte-idempotent, so re-validating on the upsert's update path moves geom_hash
    // and corrupts dedup. The UPDATE trigger is guarded so a rewrite with an
    // identical value does not re-subdivide.
    await queryRunner.query(`
      CREATE TRIGGER trg_user_geometries_subdivide_insert
      AFTER INSERT ON user_geometries
      FOR EACH ROW EXECUTE FUNCTION subdivide_user_geometry()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_user_geometries_subdivide_update
      AFTER UPDATE OF geom ON user_geometries
      FOR EACH ROW
      WHEN (OLD.geom IS DISTINCT FROM NEW.geom)
      EXECUTE FUNCTION subdivide_user_geometry()
    `);

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
    await queryRunner.query(`DROP TABLE IF EXISTS "data_filter_user_geometries"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_update ON user_geometries`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_insert ON user_geometries`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS subdivide_user_geometry`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_geometry_subdivisions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geometry_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geography"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_geometries_geom"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_geometries"`);
  }
}
