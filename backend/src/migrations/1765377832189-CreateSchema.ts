import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1765377832189 implements MigrationInterface {
  name = 'CreateSchema1765377832189';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TYPE "soilhive"."slug_history_entity_type_enum" AS ENUM('datasets', 'licenses', 'soil_property_categories', 'soil_properties', 'unit_conversions', 'analytical_methods')`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."slug_history" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "entity_id" uuid NOT NULL, "entity_type" "soilhive"."slug_history_entity_type_enum" NOT NULL, "slug" text NOT NULL, CONSTRAINT "PK_8a081bbe16d88d78868ec734204" PRIMARY KEY ("entity_id", "slug"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."unit_conversions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "original_unit_of_measurement" text, "standard_unit" text, "conversion_formula" text, CONSTRAINT "UQ_8f65c37e0e3cad54385813d36cd" UNIQUE ("slug"), CONSTRAINT "PK_26f4340a0a834dbe6cf8b241c71" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."soil_property_categories" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "category_name" text NOT NULL, "category_acronym" text NOT NULL, "description" text, CONSTRAINT "UQ_ddcd17717fa71afabfad6ebe17f" UNIQUE ("slug"), CONSTRAINT "PK_d111296e414b54267fef8392765" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."soil_properties" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "property_name" text NOT NULL, "property_acronym" text NOT NULL, "description" text, "standard_unit" text, "property_level" integer, "parent_property_id" uuid, "category_id" uuid NOT NULL, CONSTRAINT "UQ_ae95facc8e38a92e3e05dc155a0" UNIQUE ("slug"), CONSTRAINT "CHK_188f69807f9e9e83f7220b272b" CHECK ((("property_level" >= 1) AND ("property_level" <= 5))), CONSTRAINT "PK_b5f83d4e2fc51b7ae06d66695f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."datasets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "name" text NOT NULL, "full_name" text, "version" text, "author" text, "description" text, "data_producer" text, "variables_measured" jsonb array, "spatial_resolution" text, "publication_date" date, "reference_period_start" text, "reference_period_stop" text, "licenses" uuid array, "citation" text, "geographical_extent" text, "gis_datatype" text, "spatial_extent" geometry(Polygon,4326), "n_observations" bigint, "n_raster_layers" integer, "soil_depth" jsonb, "status" text NOT NULL DEFAULT 'PENDING', "created_by" text NOT NULL, "updated_by" text, "service_location" text, CONSTRAINT "UQ_8c3769423bf107f9ac88e5ab67d" UNIQUE ("slug"), CONSTRAINT "PK_1bf831e43c559a240303e23d038" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_0eb197e8bd07e096370cddc79a" ON "soilhive"."datasets" USING GiST ("spatial_extent") `);
    await queryRunner.query(
      `CREATE TABLE "soilhive"."features" ("id" uuid NOT NULL DEFAULT uuidv7(), "geom" geometry, CONSTRAINT "UQ_fd2b660b29727fb91bd1e0b1bc3" UNIQUE ("geom"), CONSTRAINT "PK_5c1e336df2f4a7051e5bf08a941" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_fd2b660b29727fb91bd1e0b1bc" ON "soilhive"."features" USING GiST ("geom") `);
    await queryRunner.query(
      `CREATE TABLE "soilhive"."licenses" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "name" text NOT NULL, "slug" text NOT NULL, "full_name" text, "url" text, CONSTRAINT "UQ_543cfb437043963bb8fc6e67c69" UNIQUE ("name"), CONSTRAINT "UQ_34c1133363605aac1c3dcd519dd" UNIQUE ("slug"), CONSTRAINT "PK_da5021501ce80efa03de6f40086" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "license" uuid, "sampling_date" date, "min_depth" integer, "max_depth" integer, "horizon" text, CONSTRAINT "UQ_71ccbb457384ab76c093848af24" UNIQUE ("license", "sampling_date", "min_depth", "max_depth", "horizon"), CONSTRAINT "PK_611c9a60a779f18c5e55e1f31b5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9c93a3425633cad126f2a97b76" ON "soilhive"."layers" ("sampling_date") `);
    await queryRunner.query(
      `CREATE TABLE "soilhive"."dataset_layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_id" uuid NOT NULL, "layer_id" uuid NOT NULL, "feature_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, CONSTRAINT "UQ_d6e8b760914c5369e3cd8a76aae" UNIQUE ("dataset_id", "feature_id", "layer_id", "soil_property_id"), CONSTRAINT "PK_ae93098f513eadb205700a04e77" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."analytical_methods" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "analytical_method" text, "analytical_tool" text, "limit_of_detection" text, "reference_standard" text, CONSTRAINT "PK_2ef1e4bff55ae4da03be3ff7aaf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."observations" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_layer_id" uuid NOT NULL, "value" numeric NOT NULL, "analytical_methodology_id" uuid, CONSTRAINT "UQ_cb4760775f415b7835cd7ebbff7" UNIQUE ("dataset_layer_id", "value", "analytical_methodology_id"), CONSTRAINT "PK_f9208d64f50a76030758087c0ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_d4f9ab2e6c5f432163d3d3a30b" ON "soilhive"."observations" ("dataset_layer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_159a9ef2802f59058f7b53fd0d" ON "soilhive"."observations" ("analytical_methodology_id") `);
    await queryRunner.query(
      `CREATE TABLE "soilhive"."locations" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coordinates" geometry(Point,4326) NOT NULL, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."jsonstorage" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" character varying NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_9edef5dd2b57675b6bd7baa65e4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."files" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "file_path" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "created_by" text NOT NULL, "updated_by" text, CONSTRAINT "UQ_67434370162217cf583370f0e74" UNIQUE ("slug"), CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."data_mappings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "data_mapping" jsonb NOT NULL, "created_by" text NOT NULL, CONSTRAINT "PK_c904beedc99759d627d42a240d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soilhive"."dataset_file_mappings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "data_mapping_id" uuid NOT NULL, "file_id" uuid, "dataset_id" uuid, CONSTRAINT "UQ_23bb05305bffe2d927279931d5e" UNIQUE ("data_mapping_id", "file_id", "dataset_id"), CONSTRAINT "PK_a850769f5e2e8d5a9e80c3ba226" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."unit_conversions" ADD CONSTRAINT "FK_6b542c70d81b414ac757e6d9f6f" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."soil_property_categories" ADD CONSTRAINT "FK_46ff570e2bcc8d68b5480fdc65d" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."soil_properties" ADD CONSTRAINT "FK_fb090fa98e33248039bafacc0cf" FOREIGN KEY ("parent_property_id") REFERENCES "soilhive"."soil_properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."soil_properties" ADD CONSTRAINT "FK_bb63f8ef8911d1a2e4103b500a0" FOREIGN KEY ("category_id") REFERENCES "soilhive"."soil_property_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."soil_properties" ADD CONSTRAINT "FK_4aba6fd1c7e9adaa6112a39b140" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."datasets" ADD CONSTRAINT "FK_816cc51c1a46eb4c8934bc04b1f" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."licenses" ADD CONSTRAINT "FK_ee237df2b602117509506e0a1b7" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."layers" ADD CONSTRAINT "FK_31bb41cd0ddace92149b86629a2" FOREIGN KEY ("license") REFERENCES "soilhive"."licenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_layers" ADD CONSTRAINT "FK_71e0d33a5ee49e3609b0544c7b3" FOREIGN KEY ("dataset_id") REFERENCES "soilhive"."datasets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_layers" ADD CONSTRAINT "FK_0bbc4523dc5f3dfb115d6136d39" FOREIGN KEY ("layer_id") REFERENCES "soilhive"."layers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_layers" ADD CONSTRAINT "FK_2b3d04dfcfe0b2e21fb2471cb85" FOREIGN KEY ("feature_id") REFERENCES "soilhive"."features"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_layers" ADD CONSTRAINT "FK_89d62c0f76f226157e341b005cb" FOREIGN KEY ("soil_property_id") REFERENCES "soilhive"."soil_properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."analytical_methods" ADD CONSTRAINT "FK_46a73a6052af10ef649b10a8946" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."observations" ADD CONSTRAINT "FK_d4f9ab2e6c5f432163d3d3a30bf" FOREIGN KEY ("dataset_layer_id") REFERENCES "soilhive"."dataset_layers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."observations" ADD CONSTRAINT "FK_159a9ef2802f59058f7b53fd0d3" FOREIGN KEY ("analytical_methodology_id") REFERENCES "soilhive"."analytical_methods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."files" ADD CONSTRAINT "FK_d6921b298823caf4fd254a8b271" FOREIGN KEY ("id", "slug") REFERENCES "soilhive"."slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_file_mappings" ADD CONSTRAINT "FK_fbf14d6b83a5f450b3ed23c410e" FOREIGN KEY ("data_mapping_id") REFERENCES "soilhive"."data_mappings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_file_mappings" ADD CONSTRAINT "FK_cb4f539ba5fff9d00110aa91aef" FOREIGN KEY ("file_id") REFERENCES "soilhive"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "soilhive"."dataset_file_mappings" ADD CONSTRAINT "FK_c95cffb2a976245915bf68e3293" FOREIGN KEY ("dataset_id") REFERENCES "soilhive"."datasets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "soilhive"."features" SET (
            autovacuum_vacuum_insert_scale_factor=0.005,
            autovacuum_analyze_scale_factor=0.005,
            autovacuum_vacuum_scale_factor=0.005
        )`);
    await queryRunner.query(`ALTER TABLE "soilhive"."layers" SET (
            autovacuum_vacuum_insert_scale_factor=0.005,
            autovacuum_analyze_scale_factor=0.005,
            autovacuum_vacuum_scale_factor=0.005
        )`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations" SET (
            autovacuum_vacuum_insert_scale_factor=0.005,
            autovacuum_analyze_scale_factor=0.005,
            autovacuum_vacuum_scale_factor=0.005
        )`);
    await queryRunner.query(`CREATE INDEX idx_geometry_geography ON "soilhive"."features" USING gist (((geom)::geography))`);
    await queryRunner.query(`CREATE INDEX idx_geometry_type ON "soilhive"."features" USING btree (st_geometrytype(geom))`);
    await queryRunner.query(`CREATE INDEX idx_layers_depthrange on "soilhive"."layers" using gist(int4range(min_depth, max_depth))`);
    await queryRunner.query(`ALTER TABLE "soilhive"."layers"
            ADD CONSTRAINT layers_unq UNIQUE NULLS NOT DISTINCT (license, sampling_date, min_depth, max_depth, horizon)`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations"
        ADD CONSTRAINT observations_unq unique NULLS NOT distinct (dataset_layer_id, value, analytical_methodology_id)`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION check_std_unit(unit_name text)
                                    RETURNS bool AS
                                $func$
                                    SELECT EXISTS (SELECT 1 FROM "soilhive"."soil_properties" WHERE COALESCE(standard_unit, '') = coalesce($1, ''));
                                $func$  LANGUAGE sql STABLE;`);
    await queryRunner.query(`ALTER TABLE "soilhive"."unit_conversions" ADD CONSTRAINT check_standard_unit_exists
                                    CHECK (check_std_unit(standard_unit)) NOT VALID;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_file_mappings" DROP CONSTRAINT "FK_c95cffb2a976245915bf68e3293"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_file_mappings" DROP CONSTRAINT "FK_cb4f539ba5fff9d00110aa91aef"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_file_mappings" DROP CONSTRAINT "FK_fbf14d6b83a5f450b3ed23c410e"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."files" DROP CONSTRAINT "FK_d6921b298823caf4fd254a8b271"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations" DROP CONSTRAINT "FK_159a9ef2802f59058f7b53fd0d3"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations" DROP CONSTRAINT "FK_d4f9ab2e6c5f432163d3d3a30bf"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."analytical_methods" DROP CONSTRAINT "FK_46a73a6052af10ef649b10a8946"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_layers" DROP CONSTRAINT "FK_89d62c0f76f226157e341b005cb"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_layers" DROP CONSTRAINT "FK_2b3d04dfcfe0b2e21fb2471cb85"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_layers" DROP CONSTRAINT "FK_0bbc4523dc5f3dfb115d6136d39"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."dataset_layers" DROP CONSTRAINT "FK_71e0d33a5ee49e3609b0544c7b3"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."layers" DROP CONSTRAINT "FK_31bb41cd0ddace92149b86629a2"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."licenses" DROP CONSTRAINT "FK_ee237df2b602117509506e0a1b7"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."datasets" DROP CONSTRAINT "FK_816cc51c1a46eb4c8934bc04b1f"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."soil_properties" DROP CONSTRAINT "FK_4aba6fd1c7e9adaa6112a39b140"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."soil_properties" DROP CONSTRAINT "FK_bb63f8ef8911d1a2e4103b500a0"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."soil_properties" DROP CONSTRAINT "FK_fb090fa98e33248039bafacc0cf"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."soil_property_categories" DROP CONSTRAINT "FK_46ff570e2bcc8d68b5480fdc65d"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."unit_conversions" DROP CONSTRAINT "FK_6b542c70d81b414ac757e6d9f6f"`);
    await queryRunner.query(`DROP TABLE "soilhive"."dataset_file_mappings"`);
    await queryRunner.query(`DROP TABLE "soilhive"."data_mappings"`);
    await queryRunner.query(`DROP TABLE "soilhive"."files"`);
    await queryRunner.query(`DROP TABLE "soilhive"."jsonstorage"`);
    await queryRunner.query(`DROP TABLE "soilhive"."locations"`);
    await queryRunner.query(`DROP INDEX "soilhive"."IDX_159a9ef2802f59058f7b53fd0d"`);
    await queryRunner.query(`DROP INDEX "soilhive"."IDX_d4f9ab2e6c5f432163d3d3a30b"`);
    await queryRunner.query(`DROP TABLE "soilhive"."observations"`);
    await queryRunner.query(`DROP TABLE "soilhive"."analytical_methods"`);
    await queryRunner.query(`DROP TABLE "soilhive"."dataset_layers"`);
    await queryRunner.query(`DROP INDEX "soilhive"."IDX_9c93a3425633cad126f2a97b76"`);
    await queryRunner.query(`DROP TABLE "soilhive"."layers"`);
    await queryRunner.query(`DROP TABLE "soilhive"."licenses"`);
    await queryRunner.query(`DROP INDEX "soilhive"."IDX_fd2b660b29727fb91bd1e0b1bc"`);
    await queryRunner.query(`DROP TABLE "soilhive"."features"`);
    await queryRunner.query(`DROP INDEX "soilhive"."IDX_0eb197e8bd07e096370cddc79a"`);
    await queryRunner.query(`DROP TABLE "soilhive"."datasets"`);
    await queryRunner.query(`DROP TABLE "soilhive"."soil_properties"`);
    await queryRunner.query(`DROP TABLE "soilhive"."soil_property_categories"`);
    await queryRunner.query(`DROP TABLE "soilhive"."unit_conversions"`);
    await queryRunner.query(`DROP TABLE "soilhive"."slug_history"`);
    await queryRunner.query(`DROP TYPE "soilhive"."slug_history_entity_type_enum"`);
    await queryRunner.query(`ALTER TABLE "soilhive"."features" RESET (
            autovacuum_vacuum_insert_scale_factor,
            autovacuum_analyze_scale_factor,
            autovacuum_vacuum_scale_factor
        )`);
    await queryRunner.query(`ALTER TABLE "soilhive"."layers" RESET (
            autovacuum_vacuum_insert_scale_factor,
            autovacuum_analyze_scale_factor,
            autovacuum_vacuum_scale_factor
        )`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations" RESET (
            autovacuum_vacuum_insert_scale_factor,
            autovacuum_analyze_scale_factor,
            autovacuum_vacuum_scale_factor
        )`);
    await queryRunner.query(`DROP INDEX idx_geometry_geography`);
    await queryRunner.query(`DROP INDEX idx_geometry_type`);
    await queryRunner.query(`DROP INDEX idx_layers_depthrange`);
    await queryRunner.query(`ALTER TABLE "soilhive"."layers" DROP CONSTRAINT layers_unq`);
    await queryRunner.query(`ALTER TABLE "soilhive"."observations" DROP CONSTRAINT observations_unq`);
    await queryRunner.query(`ALTER TABLE "soilhive"."unit_conversions" DROP CONSTRAINT check_standard_unit_exists`);
    await queryRunner.query(`DROP FUNCTION check_std_unit`);
  }
}
