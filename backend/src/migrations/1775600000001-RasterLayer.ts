import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayer1775600000001 implements MigrationInterface {
  name = 'RasterLayer1775600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [process.env.POSTGRES_DB, process.env.POSTGRES_SCHEMA, 'raster_layers', 'GENERATED_COLUMN', 'bbox', '(ST_Envelope(footprint))'],
    );
    await queryRunner.query(`CREATE TYPE "raster_layers_extent_enum" AS ENUM('global', 'continental', 'national', 'regional')`);
    await queryRunner.query(
      `CREATE TABLE "raster_layers" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "file_id" uuid NOT NULL, "resolution_m" int NOT NULL, "min_depth" int, "max_depth" int, "reference_period_start" text, "reference_period_stop" text, "dataset_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, "extent_type" "raster_layers_extent_enum" NOT NULL, "bbox" geometry(Polygon,4326) GENERATED ALWAYS AS (ST_Envelope(footprint)) STORED, "footprint" geometry(MultiPolygon,4326), "description" jsonb, "geohash_cells" text[], "nodata_value" int, CONSTRAINT "PK_raster_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_raster_layers_geohash_cells" ON "raster_layers" USING GIN  ("geohash_cells")`);
    await queryRunner.query(`CREATE INDEX "IDX_raster_layers_footprint" ON "raster_layers" USING GiST ("footprint")`);
    await queryRunner.query(`CREATE INDEX "IDX_raster_layers_bbox" ON "raster_layers" USING GiST ("bbox")`);
    await queryRunner.query(
      `ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_dataset_id_datasets_id" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_soil_property_id_soil_properties_id" FOREIGN KEY ("soil_property_id") REFERENCES "soil_properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );

    await queryRunner.query(
      `CREATE TABLE "raster_layer_assets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "file_id" uuid NOT NULL, "raster_layer_id" uuid NOT NULL, "description" jsonb, CONSTRAINT "PK_raster_layer_assets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "raster_layer_assets" ADD CONSTRAINT "FK_raster_layer_assets_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "raster_layer_assets" ADD CONSTRAINT "FK_raster_layer_assets_raster_layer_id_raster_layers_id" FOREIGN KEY ("raster_layer_id") REFERENCES "raster_layers"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_assets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "raster_layers_extent_enum"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'bbox', process.env.POSTGRES_DB, process.env.POSTGRES_SCHEMA, 'raster_layers'],
    );
  }
}
