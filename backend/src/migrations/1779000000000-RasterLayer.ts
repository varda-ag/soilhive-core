import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayer1779000000000 implements MigrationInterface {
  name = 'RasterLayer1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value")
       SELECT $1::text, $2::text, $3::text, $4::text, $5::text, $6::text
       WHERE NOT EXISTS (
         SELECT 1 FROM "typeorm_metadata"
         WHERE "type" = $4 AND "name" = $5 AND "database" = $1 AND "schema" = $2 AND "table" = $3
       )`,
      [process.env.POSTGRES_DB, process.env.POSTGRES_SCHEMA, 'raster_layers', 'GENERATED_COLUMN', 'bbox', '(ST_Envelope(footprint))'],
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layers" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "file_id" uuid NOT NULL, "resolution_m" int NOT NULL, "min_depth" int, "max_depth" int, "reference_period_start" text, "reference_period_stop" text, "dataset_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, "bbox" geometry(Polygon,4326) GENERATED ALWAYS AS (ST_Envelope(footprint)) STORED, "footprint" geometry(MultiPolygon,4326), "description" jsonb, "geohash_cells" text[], "geohash_full_coverage" boolean[], "nodata_value" int, CONSTRAINT "PK_raster_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_raster_layers_geohash_cells" ON "raster_layers" USING GIN  ("geohash_cells")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_raster_layers_footprint" ON "raster_layers" USING GiST ("footprint")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_raster_layers_bbox" ON "raster_layers" USING GiST ("bbox")`);
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layers_file_id_files_id') THEN
           ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layers_dataset_id_datasets_id') THEN
           ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_dataset_id_datasets_id" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layers_soil_property_id_soil_properties_id') THEN
           ALTER TABLE "raster_layers" ADD CONSTRAINT "FK_raster_layers_soil_property_id_soil_properties_id" FOREIGN KEY ("soil_property_id") REFERENCES "soil_properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layer_assets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "file_id" uuid NOT NULL, "raster_layer_id" uuid NOT NULL, "description" jsonb, CONSTRAINT "PK_raster_layer_assets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layer_assets_file_id_files_id') THEN
           ALTER TABLE "raster_layer_assets" ADD CONSTRAINT "FK_raster_layer_assets_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layer_assets_raster_layer_id_raster_layers_id') THEN
           ALTER TABLE "raster_layer_assets" ADD CONSTRAINT "FK_raster_layer_assets_raster_layer_id_raster_layers_id" FOREIGN KEY ("raster_layer_id") REFERENCES "raster_layers"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_assets"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'bbox', process.env.POSTGRES_DB, process.env.POSTGRES_SCHEMA, 'raster_layers'],
    );
  }
}
