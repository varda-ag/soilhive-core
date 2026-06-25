import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

// See docs/adr/0006-precomputed-geometry-subdivision-table.md
const SUBDIVIDE_MAX_VERTICES = 64;

export class CreateSchema1782000000000 implements MigrationInterface {
  name = 'CreateSchema1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // CreateSchema1775600000000
    // ============================================================

    // Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis_raster SCHEMA public`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent" SCHEMA public`);

    // Enums
    await queryRunner.query(
      `CREATE TYPE "slug_history_entity_type_enum" AS ENUM('datasets', 'licenses', 'soil_property_categories', 'soil_properties', 'unit_conversions', 'procedures', 'files', 'vocabulary')`,
    );
    await queryRunner.query(`CREATE TYPE "procedures_technique_enum" AS ENUM('lab procedure', 'spectral', 'calculated')`);
    await queryRunner.query(
      `CREATE TYPE "vocabulary_category_enum" AS ENUM('sample_pretreatment', 'laboratory_method', 'extractant_concentration', 'extraction_ratio', 'extraction_base', 'measurement_procedure', 'limit_of_detection')`,
    );
    await queryRunner.query(`CREATE TYPE "visibility_enum" AS ENUM('public', 'private')`);
    await queryRunner.query(`CREATE TYPE "unit_conversions_type_enum" AS ENUM('IDENTITY', 'SIMPLE', 'CONDITIONAL')`);

    // Functions
    /* eslint-disable */
    await queryRunner.query(`CREATE OR REPLACE FUNCTION slugify(value TEXT)
                                        RETURNS TEXT AS $$
                                        -- removes accents (diacritic signs) from a given string --
                                        WITH unaccented AS (
                                            SELECT value AS value
                                        ),
                                        -- lowercases the string
                                        lowercase AS (
                                            SELECT lower(value) AS value
                                            FROM unaccented
                                        ),
                                        -- remove single and double quotes
                                        removed_quotes AS (
                                            SELECT regexp_replace(value, '[''"]+', '', 'gi') AS value
                                            FROM lowercase
                                        ),
                                        -- replaces anything that's not a letter, number, hyphen('-'), or underscore('_') with a hyphen('-')
                                        hyphenated AS (
                                            SELECT regexp_replace(value, '[^a-z0-9\\-_]+', '-', 'gi') AS value
                                            FROM removed_quotes
                                        ),
                                        -- trims hyphens('-') if they exist on the head or tail of the string
                                        trimmed AS (
                                            SELECT regexp_replace(regexp_replace(value, '\-+$', ''), '^\-', '') AS value
                                            FROM hyphenated
                                        )
                                        SELECT value FROM trimmed;
                                        $$ LANGUAGE SQL STRICT IMMUTABLE`);
    /* eslint-enable */

    await queryRunner.query(`CREATE OR REPLACE FUNCTION slug_generate_store_old()
                                        RETURNS trigger
                                        LANGUAGE plpgsql
                                        AS $function$
                                        declare
                                        slug_cols_in text[] := TG_ARGV[0]::text[];
                                            lv_base_slug text;
                                        lv_new_slug TEXT;
                                        lv_counter INTEGER := 1;
                                        lv_exists boolean;
                                        begin
                                        -- Generate the base slug
                                        EXECUTE format('SELECT %I.slugify(concat_ws(''-'', %s))', TG_TABLE_SCHEMA, array_to_string(slug_cols_in, ', ')) using NEW into lv_base_slug;
                                        lv_new_slug := lv_base_slug;

                                        -- IMPORTANT: schema-qualify, do not rely on search_path (pool connections can differ)
                                        EXECUTE format(
                                          'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
                                          TG_TABLE_SCHEMA,
                                          lv_new_slug
                                        ) into lv_exists;
                                        -- Check if the slug already exists
                                        WHILE lv_exists LOOP
                                        -- If it exists, append a number and increment
                                            lv_new_slug := lv_base_slug || '-' || lv_counter;
                                            lv_counter := lv_counter + 1;
                                            EXECUTE format(
                                              'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
                                              TG_TABLE_SCHEMA,
                                              lv_new_slug
                                            ) into lv_exists;
                                        END LOOP;

                                        NEW.slug := lv_new_slug;
                                        -- Also schema-qualify slug_history + enum type
                                        EXECUTE format(
                                          'INSERT INTO %I.slug_history(entity_id, entity_type, slug) VALUES ($1, $2::%I.slug_history_entity_type_enum, $3)',
                                          TG_TABLE_SCHEMA,
                                          TG_TABLE_SCHEMA
                                        ) USING NEW.id, TG_TABLE_NAME, NEW.slug;
                                        RETURN NEW;
                                        end;
                                    $function$`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION slug_procedures_generate_store_old()
                                RETURNS trigger
                                LANGUAGE plpgsql
                                AS $function$
                                    declare
                                    lv_values_names text[];
                                    lv_base_slug text;
                                    lv_new_slug TEXT;
                                    lv_counter INTEGER := 1;
                                    lv_exists boolean;
                                    begin
                                    -- Generate the base slug
                                    EXECUTE format(
                                      'SELECT ARRAY[pv1.name, $1, pv2.name, pv3.name, pv4.name, pv5.name, pv6.name, pv7.name]
                                       FROM (SELECT 1) AS dummy
                                       LEFT JOIN %1$I.vocabulary pv1 ON pv1.id = $2  AND pv1.category = ''sample_pretreatment''
                                       LEFT JOIN %1$I.vocabulary pv2 ON pv2.id = $3  AND pv2.category = ''laboratory_method''
                                       LEFT JOIN %1$I.vocabulary pv3 ON pv3.id = $4  AND pv3.category = ''extractant_concentration''
                                       LEFT JOIN %1$I.vocabulary pv4 ON pv4.id = $5  AND pv4.category = ''extraction_ratio''
                                       LEFT JOIN %1$I.vocabulary pv5 ON pv5.id = $6  AND pv5.category = ''extraction_base''
                                       LEFT JOIN %1$I.vocabulary pv6 ON pv6.id = $7  AND pv6.category = ''measurement_procedure''
                                       LEFT JOIN %1$I.vocabulary pv7 ON pv7.id = $8  AND pv7.category = ''limit_of_detection''',
                                      TG_TABLE_SCHEMA
                                    ) INTO lv_values_names
                                    USING
                                      NEW.technique::text,
                                      COALESCE(NEW.sample_pretreatment_id,      OLD.sample_pretreatment_id),
                                      COALESCE(NEW.laboratory_method_id,        OLD.laboratory_method_id),
                                      COALESCE(NEW.extractant_concentration_id, OLD.extractant_concentration_id),
                                      COALESCE(NEW.extraction_ratio_id,         OLD.extraction_ratio_id),
                                      COALESCE(NEW.extraction_base_id,          OLD.extraction_base_id),
                                      COALESCE(NEW.measurement_procedure_id,    OLD.measurement_procedure_id),
                                      COALESCE(NEW.limit_of_detection_id,       OLD.limit_of_detection_id);

                                    EXECUTE format('SELECT %I.slugify(concat_ws(''-'', %L))', TG_TABLE_SCHEMA, array_to_string(lv_values_names, ', ')) into lv_base_slug;
                                    lv_new_slug := lv_base_slug;

                                    EXECUTE format(
                                      'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
                                      TG_TABLE_SCHEMA,
                                      lv_new_slug
                                    ) into lv_exists;
                                    -- Check if the slug already exists
                                    WHILE lv_exists LOOP
                                    -- If it exists, append a number and increment
                                        lv_new_slug := lv_base_slug || '-' || lv_counter;
                                        lv_counter := lv_counter + 1;
                                        EXECUTE format(
                                          'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
                                          TG_TABLE_SCHEMA,
                                          lv_new_slug
                                        ) into lv_exists;
                                    END LOOP;

                                    NEW.slug := lv_new_slug;
                                    -- Schema-qualify slug_history + enum type
                                    EXECUTE format(
                                      'INSERT INTO %I.slug_history(entity_id, entity_type, slug) VALUES ($1, $2::%I.slug_history_entity_type_enum, $3)',
                                      TG_TABLE_SCHEMA,
                                      TG_TABLE_SCHEMA
                                    ) USING NEW.id, TG_TABLE_NAME, NEW.slug;
                                    RETURN NEW;
                                    end;
                                $function$`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION slug_unit_conversions_generate_store_old()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $function$
          declare
          lv_values_names text[];
          lv_base_slug text;
          lv_new_slug TEXT;
          lv_counter INTEGER := 1;
          lv_exists boolean;
          begin
          -- Generate the base slug
          SELECT ARRAY[sp.property_name, COALESCE(NEW.original_unit_of_measurement, OLD.original_unit_of_measurement)]
          INTO lv_values_names
           FROM (SELECT NEW.*) AS t
           LEFT JOIN soil_properties sp ON COALESCE(NEW.property_id, OLD.property_id)=sp.id;

           EXECUTE format('SELECT %I.slugify(concat_ws(''-'', %L))', TG_TABLE_SCHEMA, array_to_string(lv_values_names, ', ')) into lv_base_slug;
          lv_new_slug := lv_base_slug;

          -- IMPORTANT: schema-qualify, do not rely on search_path (pool connections can differ)
          EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
            TG_TABLE_SCHEMA,
            lv_new_slug
          ) into lv_exists;
          -- Check if the slug already exists
          WHILE lv_exists LOOP
          -- If it exists, append a number and increment
              lv_new_slug := lv_base_slug || '-' || lv_counter;
              lv_counter := lv_counter + 1;
              EXECUTE format(
                'SELECT EXISTS (SELECT 1 FROM %I.slug_history WHERE slug = %L)',
                TG_TABLE_SCHEMA,
                lv_new_slug
              ) into lv_exists;
          END LOOP;

          NEW.slug := lv_new_slug;
          -- Also schema-qualify slug_history + enum type
          EXECUTE format(
            'INSERT INTO %I.slug_history(entity_id, entity_type, slug) VALUES ($1, $2::%I.slug_history_entity_type_enum, $3)',
            TG_TABLE_SCHEMA,
            TG_TABLE_SCHEMA
          ) USING NEW.id, TG_TABLE_NAME, NEW.slug;
          RETURN NEW;
          end;
      $function$`);

    // Tables (in dependency order)
    await queryRunner.query(
      `CREATE TABLE "slug_history" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "entity_id" uuid NOT NULL, "entity_type" "slug_history_entity_type_enum" NOT NULL, "slug" text NOT NULL, CONSTRAINT "PK_slug_history_entity_id_slug" PRIMARY KEY ("entity_id", "slug"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soil_property_categories" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "category_name" text NOT NULL, "category_acronym" text NOT NULL, "description" text, CONSTRAINT "UQ_soil_property_categories_category_name" UNIQUE ("category_name"), CONSTRAINT "PK_soil_property_categories_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soil_properties" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "property_name" text NOT NULL, "property_acronym" text NOT NULL, "description" text, "standard_unit" text, "property_level" integer, "parent_property_id" uuid, "category_id" uuid NOT NULL, CONSTRAINT "UQ_soil_properties_property_name" UNIQUE ("property_name"), CONSTRAINT "CHK_e77399e8e3090fe38abe5c160c" CHECK ((("property_level" >= 1) AND ("property_level" <= 2))), CONSTRAINT "PK_soil_properties_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "licenses" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "name" text NOT NULL, "slug" text NOT NULL, "full_name" text, "url" text, CONSTRAINT "UQ_licenses_name" UNIQUE ("name"), CONSTRAINT "PK_licenses_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      ['database', process.env.POSTGRES_SCHEMA, 'features', 'GENERATED_COLUMN', 'geom_hash', "(encode(sha256(geom::TEXT::BYTEA), 'hex'))"],
    );
    await queryRunner.query(
      `CREATE TABLE "features" ("id" uuid NOT NULL DEFAULT uuidv7(), "geom" geometry, "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL, CONSTRAINT "UQ_features_geom_hash" UNIQUE ("geom_hash"), CONSTRAINT "PK_features_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "datasets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "name" text NOT NULL, "full_name" text, "version" text, "author" text, "description" text, "data_producer" text, "variables_measured" jsonb, "spatial_resolution" text, "publication_date" date, "reference_period_start" text, "reference_period_stop" text, "licenses" text[], "citation" text, "geographical_extent" text, "gis_datatype" text, "spatial_extent" geometry(Polygon,4326), "n_observations" bigint, "n_raster_layers" integer, "soil_depth" jsonb, "status" text NOT NULL DEFAULT 'PENDING', "created_by" text NOT NULL, "updated_by" text, "service_location" text, "processing_steps" JSONB, "visibility" "visibility_enum" NOT NULL DEFAULT 'private', CONSTRAINT "PK_datasets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "vocabulary" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "category" "vocabulary_category_enum" NOT NULL, "name" text NOT NULL, CONSTRAINT "UQ_vocabulary_id_category" UNIQUE ("id", "category"), CONSTRAINT "PK_vocabulary_id_slug" PRIMARY KEY ("id", "slug"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "procedures" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "technique" "procedures_technique_enum", "sample_pretreatment_id" uuid, "laboratory_method_id" uuid, "extractant_concentration_id" uuid, "extraction_ratio_id" uuid, "extraction_base_id" uuid, "measurement_procedure_id" uuid, "limit_of_detection_id" uuid, "sample_pretreatment_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('sample_pretreatment'::"vocabulary_category_enum") STORED, "laboratory_method_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('laboratory_method'::"vocabulary_category_enum") STORED, "extractant_concentration_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('extractant_concentration'::"vocabulary_category_enum") STORED, "extraction_ratio_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('extraction_ratio'::"vocabulary_category_enum") STORED, "extraction_base_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('extraction_base'::"vocabulary_category_enum") STORED, "measurement_procedure_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('measurement_procedure'::"vocabulary_category_enum") STORED, "limit_of_detection_category" "vocabulary_category_enum" GENERATED ALWAYS AS ('limit_of_detection'::"vocabulary_category_enum") STORED, CONSTRAINT "UQ_procedures_sample_pretreatment_id_technique_laboratory_method_id_extractant_concentration_id_extraction_ratio_id_extraction_base_id_measurement_procedure_id_limit_of_detection_id" UNIQUE NULLS NOT DISTINCT (sample_pretreatment_id, technique, laboratory_method_id, extractant_concentration_id, extraction_ratio_id, extraction_base_id, measurement_procedure_id, limit_of_detection_id), CONSTRAINT "PK_procedures_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "license" uuid, "sampling_date" TEXT, "min_depth" integer, "max_depth" integer, "horizon" text, CONSTRAINT "PK_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dataset_layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_id" uuid NOT NULL, "layer_id" uuid NOT NULL, "feature_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, "datasets_feature_layer_hash" TEXT GENERATED ALWAYS AS (encode(sha256(("dataset_id"::text || "feature_id"::text || "layer_id"::text)::TEXT::BYTEA), 'hex')) STORED NOT NULL, CONSTRAINT "UQ_dataset_layers_dataset_id_feature_id_layer_id_soil_property_id" UNIQUE ("dataset_id", "feature_id", "layer_id", "soil_property_id"), CONSTRAINT "PK_dataset_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "observations" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_layer_id" uuid NOT NULL, "value" numeric NOT NULL, "procedure_id" uuid, CONSTRAINT "PK_observations_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "jsonstorage" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" character varying NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_jsonstorage_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "files" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "name" text NOT NULL, "file_path" text, "status" text DEFAULT 'PENDING'::text, "created_by" text NOT NULL, "updated_by" text, "metadata" jsonb, CONSTRAINT "UQ_files_file_path" UNIQUE ("file_path"), CONSTRAINT "PK_files_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'database',
        process.env.POSTGRES_SCHEMA,
        'data_mappings',
        'GENERATED_COLUMN',
        'data_mapping_hash',
        "(encode(sha256(data_mapping::TEXT::BYTEA), 'hex'))",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "data_mappings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "data_mapping" jsonb NOT NULL, "data_mapping_hash" text GENERATED ALWAYS AS (encode(sha256(data_mapping::TEXT::BYTEA), 'hex')) STORED NOT NULL, "created_by" text NOT NULL, CONSTRAINT "UQ_data_mappings_data_mapping_hash" UNIQUE ("data_mapping_hash"), CONSTRAINT "PK_data_mappings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dataset_file_mappings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "data_mapping_id" uuid, "file_id" uuid, "dataset_id" uuid NOT NULL, CONSTRAINT "UQ_dataset_file_mappings_data_mapping_id_file_id_dataset_id" UNIQUE ("data_mapping_id", "file_id", "dataset_id"), CONSTRAINT "PK_dataset_file_mappings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_filters" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "filter" jsonb NOT NULL, "persistent" boolean NOT NULL DEFAULT false, "name" text, "owner" text, CONSTRAINT "PK_data_filters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "raster_filters" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL, "mappings" jsonb, CONSTRAINT "PK_raster_filters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "entitlements" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "id" text NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_entitlements_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "unit_conversions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "original_unit_of_measurement" text, "conversion_formula" text, "property_id" uuid NOT NULL, "metadata" jsonb, "type" unit_conversions_type_enum NOT NULL DEFAULT 'IDENTITY'::unit_conversions_type_enum, CONSTRAINT "UQ_unit_conversions_property_id_original_unit_of_measurement" UNIQUE ("property_id", "original_unit_of_measurement"), CONSTRAINT "PK_unit_conversions_id" PRIMARY KEY ("id"))`,
    );

    // Indexes
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_datasets_name_WHERE_deleted_at_IS_NULL" ON "datasets" ("name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_datasets_spatial_extent" ON "datasets" USING GiST ("spatial_extent") `);
    await queryRunner.query(`CREATE INDEX "IDX_features_geom" ON "features" USING GiST ("geom") `);
    await queryRunner.query(`CREATE INDEX "IDX_layers_sampling_date" ON "layers" ("sampling_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_observations_dataset_layer_id" ON "observations" ("dataset_layer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_observations_procedure_id" ON "observations" ("procedure_id") `);
    await queryRunner.query(`CREATE INDEX idx_geometry_geography ON "features" USING gist (((geom)::geography))`);
    await queryRunner.query(`CREATE INDEX idx_geometry_type ON "features" USING btree (st_geometrytype(geom))`);
    await queryRunner.query(`CREATE INDEX idx_layers_depthrange on "layers" using gist(int4range(min_depth, max_depth))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_vocabulary_id_category_WHERE_deleted_at_IS_NULL" ON "vocabulary" ("id", "category") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_dataset_layers_dataset" ON "dataset_layers" USING btree ("dataset_id")`);
    await queryRunner.query(`CREATE INDEX "idx_dataset_layers_feature" ON "dataset_layers" USING btree ("feature_id")`);
    await queryRunner.query(`CREATE INDEX "idx_entitlements_data_gin" ON "entitlements" USING GIN (data)`);

    // Additional constraints
    await queryRunner.query(
      `ALTER TABLE "layers" ADD CONSTRAINT "UQ_layers_license_sampling_date_min_depth_max_depth_horizon" UNIQUE NULLS NOT DISTINCT (license, sampling_date, min_depth, max_depth, horizon)`,
    );
    await queryRunner.query(
      `ALTER TABLE "observations" ADD CONSTRAINT "UQ_observations_dataset_layer_id_value_procedure_id" unique NULLS NOT distinct (dataset_layer_id, value, procedure_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE "layers" ADD CONSTRAINT chk_date_format CHECK ("sampling_date" ~ '^\\d{4}$' OR "sampling_date" ~ '^\\d{4}-\\d{2}$' OR "sampling_date" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    );
    await queryRunner.query(`ALTER TABLE "features" ALTER COLUMN "geom" SET STATISTICS 1000`);

    // Foreign keys
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ADD CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ADD CONSTRAINT "FK_unit_conversions_property_id_soil_properties_id" FOREIGN KEY ("property_id") REFERENCES "soil_properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_property_categories" ADD CONSTRAINT "FK_soil_property_categories_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_properties" ADD CONSTRAINT "FK_soil_properties_parent_property_id_soil_properties_id" FOREIGN KEY ("parent_property_id") REFERENCES "soil_properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_properties" ADD CONSTRAINT "FK_soil_properties_category_id_soil_property_categories_id" FOREIGN KEY ("category_id") REFERENCES "soil_property_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_properties" ADD CONSTRAINT "FK_soil_properties_id_id_slug_slug_slug_history_slug_entity_id_entity_id_slug" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "datasets" ADD CONSTRAINT "FK_datasets_id_id_slug_slug_slug_history_slug_entity_id_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" ADD CONSTRAINT "FK_licenses_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_sample_pretreatment_id_sample_pretreatment_category_vocabulary_id_category" FOREIGN KEY (sample_pretreatment_id, sample_pretreatment_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_laboratory_method_id_laboratory_method_category_vocabulary_id_category" FOREIGN KEY (laboratory_method_id, laboratory_method_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extractant_concentration_id_extractant_concentration_category_vocabulary_id_category" FOREIGN KEY (extractant_concentration_id, extractant_concentration_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extraction_ratio_id_extraction_ratio_category_vocabulary_id_category" FOREIGN KEY (extraction_ratio_id, extraction_ratio_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extraction_base_id_extraction_base_category_vocabulary_id_category" FOREIGN KEY (extraction_base_id, extraction_base_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_measurement_procedure_id_smeasurement_procedure_category_vocabulary_id_category" FOREIGN KEY (measurement_procedure_id, measurement_procedure_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_limit_of_detection_id_limit_of_detection_category_vocabulary_id_category" FOREIGN KEY (limit_of_detection_id, limit_of_detection_category) REFERENCES "vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "layers" ADD CONSTRAINT "FK_layers_license_licenses_id" FOREIGN KEY ("license") REFERENCES "licenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_layers" ADD CONSTRAINT "FK_dataset_layers_dataset_id_datasets_id" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_layers" ADD CONSTRAINT "FK_dataset_layers_layer_id_layers_id" FOREIGN KEY ("layer_id") REFERENCES "layers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_layers" ADD CONSTRAINT "FK_dataset_layers_feature_id_features_id" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_layers" ADD CONSTRAINT "FK_dataset_layers_soil_property_id_soil_properties_id" FOREIGN KEY ("soil_property_id") REFERENCES "soil_properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "observations" ADD CONSTRAINT "FK_observations_dataset_layer_id_dataset_layers_id" FOREIGN KEY ("dataset_layer_id") REFERENCES "dataset_layers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "observations" ADD CONSTRAINT "FK_observations_procedure_id_procedures_id" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" ADD CONSTRAINT "FK_files_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_file_mappings" ADD CONSTRAINT "FK_dataset_file_mappings_data_mapping_id_data_mappings_id" FOREIGN KEY ("data_mapping_id") REFERENCES "data_mappings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_file_mappings" ADD CONSTRAINT "FK_dataset_file_mappings_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataset_file_mappings" ADD CONSTRAINT "FK_dataset_file_mappings_dataset_id_datasets_id" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Triggers
    await queryRunner.query(`CREATE OR REPLACE TRIGGER dataset_slug
                                        BEFORE INSERT OR update of name ON datasets
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`CREATE or replace TRIGGER property_slug
                                        BEFORE INSERT OR update of property_name ON soil_properties
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.property_name}')`);
    await queryRunner.query(
      `CREATE OR REPLACE TRIGGER "procedure_slug" BEFORE INSERT OR UPDATE OF technique, sample_pretreatment_id, laboratory_method_id, extractant_concentration_id, extraction_ratio_id, extraction_base_id, measurement_procedure_id, limit_of_detection_id ON "procedures" FOR EACH ROW EXECUTE FUNCTION slug_procedures_generate_store_old()`,
    );
    await queryRunner.query(`CREATE OR REPLACE TRIGGER property_category_slug
                                        BEFORE INSERT OR update of category_name ON soil_property_categories
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.category_name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER unit_conversion_slug
                                        BEFORE INSERT OR update ON unit_conversions
                                        FOR EACH ROW EXECUTE PROCEDURE slug_unit_conversions_generate_store_old()`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER license_slug
                                        BEFORE INSERT OR update of name ON licenses
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER file_slug
                                        BEFORE INSERT OR update of name ON files
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER vocabulary_slug
                                        BEFORE INSERT OR update of name ON vocabulary
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);

    // Seed data
    await queryRunner.query(
      `
      INSERT INTO "raster_filters" (id,name,description) VALUES ('land_cover','Land cover','The Copernicus Global Land Service (CGLS) provides a series of biogeophysical products (i.e. Leaf Area Index, Land Surface Temperature, soil moisture, etc.) on the status and evolution of land surface at global scale.');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('agroecological_zones', 'Agroecological zones', 'The Food and Agriculture Organization of the United Nations (FAO) and the International Institute for Applied Systems Analysis (IIASA) have cooperated over several decades to develop and implement the Agro-Ecological Zones (AEZ) modeling framework and databases. AEZ relies on well-established land evaluation principles to assess natural resources for finding suitable agricultural land utilization options. Compilation of an AEZ agro-climatic inventory using several climatic variables (e.g. temperature, precipitation, sunshine fraction, relative humidity) gives a <strong>general characterization of climatic resources, signifies their suitability for agricultural use and provides data and indicators related to climatic requirements of crop growth, development and yield formation. Source: © FAO, 2021. Global Agro-Ecological Zones v4');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('soil_groups', 'Soil Groups', 'This filter refers to the categories defined by the WRB, an international soil classification system developed by the IUSS. These groups classify soils based on their physical and chemical properties, providing a standardized framework for naming soils and creating legends for soil maps. FAO & IIASA. 2023. Harmonized World Soil Database version 2.0. Rome and Laxenburg.');
      `,
    );

    const base = path.resolve(__dirname, './data');
    const files = [
      '0_licenses_data_insert.sql',
      '0_procedures_data_insert.sql',
      '0_soil_property_categories_data_insert.sql',
      '1_soil_properties_data_insert.sql',
      '2_unit_conversions_data_insert.sql',
    ];
    for (const file of files) {
      const sql = fs.readFileSync(path.join(base, file), 'utf8');
      await queryRunner.query(sql);
    }

    // ============================================================
    // InferredProperties1778687000000
    // ============================================================
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "inferred_properties" text[]`);

    // ============================================================
    // RasterLayer1779000000000
    // ============================================================
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

    // ============================================================
    // DatasetMetadataFields1780000000000
    // ============================================================
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "preprocessing_steps" text`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "related_resources" text[]`);

    // ============================================================
    // UserGeometries1781000000000
    // ============================================================
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_geometries" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "geom" geometry,
        "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL,
        "area" double precision GENERATED ALWAYS AS (ST_Area(geom::geography)) STORED,
        CONSTRAINT "UQ_user_geometries_geom_hash" UNIQUE ("geom_hash"),
        CONSTRAINT "PK_user_geometries_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_geometries_geom" ON "user_geometries" USING GiST ("geom")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_geometries_geography" ON "user_geometries" USING gist (((geom)::geography))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_geometries_geometry_type" ON "user_geometries" USING btree (st_geometrytype(geom))`,
    );
    await queryRunner.query(`ALTER TABLE "user_geometries" ALTER COLUMN "geom" SET STATISTICS 1000`);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_geometry_subdivisions" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_geometry_id" uuid NOT NULL,
        "geom" geometry NOT NULL,
        CONSTRAINT "PK_user_geometry_subdivisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ugs_user_geometry_id" FOREIGN KEY ("user_geometry_id") REFERENCES "user_geometries"("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_geometry_subdivisions_geom" ON "user_geometry_subdivisions" USING GiST ("geom")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_geometry_subdivisions_user_geometry_id" ON "user_geometry_subdivisions" ("user_geometry_id")`,
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
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_insert ON user_geometries`);
    await queryRunner.query(`
      CREATE TRIGGER trg_user_geometries_subdivide_insert
      AFTER INSERT ON user_geometries
      FOR EACH ROW EXECUTE FUNCTION subdivide_user_geometry()
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_update ON user_geometries`);
    await queryRunner.query(`
      CREATE TRIGGER trg_user_geometries_subdivide_update
      AFTER UPDATE OF geom ON user_geometries
      FOR EACH ROW
      WHEN (OLD.geom IS DISTINCT FROM NEW.geom)
      EXECUTE FUNCTION subdivide_user_geometry()
    `);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "data_filter_user_geometries" (
        "data_filter_id" uuid NOT NULL,
        "user_geometry_id" uuid NOT NULL,
        CONSTRAINT "PK_data_filter_user_geometries" PRIMARY KEY ("data_filter_id", "user_geometry_id"),
        CONSTRAINT "FK_dfug_data_filter_id" FOREIGN KEY ("data_filter_id") REFERENCES "data_filters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dfug_user_geometry_id" FOREIGN KEY ("user_geometry_id") REFERENCES "user_geometries"("id") ON DELETE RESTRICT
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // UserGeometries1781000000000 (reverse)
    // ============================================================
    await queryRunner.query(`DROP TABLE IF EXISTS "data_filter_user_geometries"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_update ON user_geometries`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_user_geometries_subdivide_insert ON user_geometries`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS subdivide_user_geometry`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_geometry_subdivisions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geometry_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_geometries_geography"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_geometries_geom"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_geometries"`);

    // ============================================================
    // DatasetMetadataFields1780000000000 (reverse)
    // ============================================================
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "related_resources"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "preprocessing_steps"`);

    // ============================================================
    // RasterLayer1779000000000 (reverse)
    // ============================================================
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_delete_orphan_raster_footprints ON raster_layer_footprints`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS delete_orphan_raster_footprints`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_footprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_footprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "raster_layer_assets"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = 'GENERATED_COLUMN' AND "name" = 'geom_hash' AND "table" = 'raster_footprints'`,
    );

    // ============================================================
    // InferredProperties1778687000000 (reverse)
    // ============================================================
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "inferred_properties"`);

    // ============================================================
    // CreateSchema1775600000000 (reverse)
    // ============================================================
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS dataset_slug ON datasets`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS property_slug ON soil_properties`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS procedure_slug ON procedures`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS property_category_slug ON soil_property_categories`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS unit_conversion_slug ON unit_conversions`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS license_slug ON licenses`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS file_slug ON files`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS vocabulary_slug ON vocabulary`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "dataset_file_mappings" DROP CONSTRAINT "FK_dataset_file_mappings_dataset_id_datasets_id"`);
    await queryRunner.query(`ALTER TABLE "dataset_file_mappings" DROP CONSTRAINT "FK_dataset_file_mappings_file_id_files_id"`);
    await queryRunner.query(
      `ALTER TABLE "dataset_file_mappings" DROP CONSTRAINT "FK_dataset_file_mappings_data_mapping_id_data_mappings_id"`,
    );
    await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT "FK_files_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`);
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT "FK_observations_procedure_id_procedures_id"`);
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT "FK_observations_dataset_layer_id_dataset_layers_id"`);
    await queryRunner.query(`ALTER TABLE "dataset_layers" DROP CONSTRAINT "FK_dataset_layers_soil_property_id_soil_properties_id"`);
    await queryRunner.query(`ALTER TABLE "dataset_layers" DROP CONSTRAINT "FK_dataset_layers_feature_id_features_id"`);
    await queryRunner.query(`ALTER TABLE "dataset_layers" DROP CONSTRAINT "FK_dataset_layers_layer_id_layers_id"`);
    await queryRunner.query(`ALTER TABLE "dataset_layers" DROP CONSTRAINT "FK_dataset_layers_dataset_id_datasets_id"`);
    await queryRunner.query(`ALTER TABLE "layers" DROP CONSTRAINT "FK_layers_license_licenses_id"`);
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_limit_of_detection_id_limit_of_detection_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_measurement_procedure_id_smeasurement_procedure_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_extraction_base_id_extraction_base_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_extraction_ratio_id_extraction_ratio_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_extractant_concentration_id_extractant_concentration_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_laboratory_method_id_laboratory_method_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT IF EXISTS "FK_procedures_sample_pretreatment_id_sample_pretreatment_category_vocabulary_id_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT "FK_procedures_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP CONSTRAINT "FK_licenses_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "datasets" DROP CONSTRAINT "FK_datasets_id_id_slug_slug_slug_history_slug_entity_id_slug_entity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_properties" DROP CONSTRAINT "FK_soil_properties_id_id_slug_slug_slug_history_slug_entity_id_entity_id_slug"`,
    );
    await queryRunner.query(`ALTER TABLE "soil_properties" DROP CONSTRAINT "FK_soil_properties_category_id_soil_property_categories_id"`);
    await queryRunner.query(`ALTER TABLE "soil_properties" DROP CONSTRAINT "FK_soil_properties_parent_property_id_soil_properties_id"`);
    await queryRunner.query(
      `ALTER TABLE "soil_property_categories" DROP CONSTRAINT "FK_soil_property_categories_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug"`,
    );
    await queryRunner.query(`ALTER TABLE "unit_conversions" DROP CONSTRAINT "FK_unit_conversions_property_id_soil_properties_id"`);
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" DROP CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
    );

    // Drop tables (reverse dependency order)
    await queryRunner.query(`DROP TABLE "unit_conversions"`);
    await queryRunner.query(`DROP TABLE "entitlements"`);
    await queryRunner.query(`DROP TABLE "raster_filters"`);
    await queryRunner.query(`DROP TABLE "data_filters"`);
    await queryRunner.query(`DROP TABLE "dataset_file_mappings"`);
    await queryRunner.query(`DROP TABLE "data_mappings"`);
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(`DROP TABLE "jsonstorage"`);
    await queryRunner.query(`DROP TABLE "observations"`);
    await queryRunner.query(`DROP TABLE "dataset_layers"`);
    await queryRunner.query(`DROP TABLE "layers"`);
    await queryRunner.query(`DROP TABLE "procedures"`);
    await queryRunner.query(`DROP TABLE "vocabulary"`);
    await queryRunner.query(`DROP TABLE "datasets"`);
    await queryRunner.query(`DROP TABLE "features"`);
    await queryRunner.query(`DROP TABLE "licenses"`);
    await queryRunner.query(`DROP TABLE "soil_properties"`);
    await queryRunner.query(`DROP TABLE "soil_property_categories"`);
    await queryRunner.query(`DROP TABLE "slug_history"`);

    // Drop typeorm metadata
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'geom_hash', 'database', process.env.POSTGRES_SCHEMA, 'features'],
    );
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'data_mapping_hash', 'database', process.env.POSTGRES_SCHEMA, 'data_mappings'],
    );

    // Drop functions
    await queryRunner.query(`DROP FUNCTION IF EXISTS slug_unit_conversions_generate_store_old`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS slug_procedures_generate_store_old`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS slug_generate_store_old`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS slugify`);

    // Drop types
    await queryRunner.query(`DROP TYPE IF EXISTS "visibility_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vocabulary_category_enum"`);
    await queryRunner.query(`DROP TYPE "procedures_technique_enum"`);
    await queryRunner.query(`DROP TYPE "slug_history_entity_type_enum"`);

    // Drop extensions
    await queryRunner.query(`DROP EXTENSION IF EXISTS "unaccent"`);
  }
}
