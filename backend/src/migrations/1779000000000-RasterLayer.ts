import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayer1779000000000 implements MigrationInterface {
  name = 'RasterLayer1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layers" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "file_id" uuid NOT NULL, "resolution_m" int NOT NULL, "min_depth" int, "max_depth" int, "reference_period_start" text, "reference_period_stop" text, "dataset_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, "description" jsonb, "nodata_value" int, "bbox" geometry(Polygon,4326) NOT NULL, CONSTRAINT "PK_raster_layers_id" PRIMARY KEY ("id"))`,
    );
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

    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'database',
        process.env.POSTGRES_SCHEMA,
        'raster_footprints',
        'GENERATED_COLUMN',
        'geom_hash',
        "(encode(sha256(geom::TEXT::BYTEA), 'hex'))",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_footprints" ("id" uuid NOT NULL DEFAULT uuidv7(), "geom" geometry(MultiPolygon,4326) NOT NULL, "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL, CONSTRAINT "UQ_raster_footprints_geom_hash" UNIQUE ("geom_hash"), CONSTRAINT "PK_raster_footprints_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_raster_footprints_geom" ON "raster_footprints" USING GiST ("geom")`);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "raster_layer_footprints" ("raster_layer_id" uuid NOT NULL, "raster_footprint_id" uuid NOT NULL, CONSTRAINT "PK_raster_layer_footprints" PRIMARY KEY ("raster_layer_id", "raster_footprint_id"))`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layer_footprints_raster_layer_id') THEN
           ALTER TABLE "raster_layer_footprints" ADD CONSTRAINT "FK_raster_layer_footprints_raster_layer_id" FOREIGN KEY ("raster_layer_id") REFERENCES "raster_layers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_raster_layer_footprints_raster_footprint_id') THEN
           ALTER TABLE "raster_layer_footprints" ADD CONSTRAINT "FK_raster_layer_footprints_raster_footprint_id" FOREIGN KEY ("raster_footprint_id") REFERENCES "raster_footprints"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION delete_orphan_raster_footprints() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         DELETE FROM raster_footprints
         WHERE id = OLD.raster_footprint_id
           AND NOT EXISTS (
             SELECT 1 FROM raster_layer_footprints WHERE raster_footprint_id = OLD.raster_footprint_id
           );
         RETURN NULL;
       END $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_delete_orphan_raster_footprints
       AFTER DELETE ON raster_layer_footprints
       FOR EACH ROW EXECUTE FUNCTION delete_orphan_raster_footprints()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_delete_orphan_raster_footprints ON raster_layer_footprints`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS delete_orphan_raster_footprints`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_footprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_footprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_assets"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = 'GENERATED_COLUMN' AND "name" = 'geom_hash' AND "table" = 'raster_footprints'`,
    );
  }
}
