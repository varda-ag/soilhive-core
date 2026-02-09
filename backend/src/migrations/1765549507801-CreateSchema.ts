import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1765549507801 implements MigrationInterface {
  name = 'CreateSchema1765549507801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TYPE "slug_history_entity_type_enum" AS ENUM('datasets', 'licenses', 'soil_property_categories', 'soil_properties', 'unit_conversions', 'procedures', 'files')`,
    );
    await queryRunner.query(`CREATE TYPE "procedures_technique_enum" AS ENUM('lab procedure', 'spectral', 'calculated')`);
    await queryRunner.query(
      `CREATE TABLE "slug_history" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "entity_id" uuid NOT NULL, "entity_type" "slug_history_entity_type_enum" NOT NULL, "slug" text NOT NULL, CONSTRAINT "PK_slug_history_entity_id_slug" PRIMARY KEY ("entity_id", "slug"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "unit_conversions" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "original_unit_of_measurement" text, "standard_unit" text, "conversion_formula" text, CONSTRAINT "UQ_unit_conversions_slug" UNIQUE ("slug"), CONSTRAINT "PK_unit_conversions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soil_property_categories" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "category_name" text NOT NULL, "category_acronym" text NOT NULL, "description" text, CONSTRAINT "UQ_soil_property_categories_slug" UNIQUE ("slug"), CONSTRAINT "UQ_soil_property_categories_category_name" UNIQUE ("category_name"), CONSTRAINT "PK_soil_property_categories_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "soil_properties" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "property_name" text NOT NULL, "property_acronym" text NOT NULL, "description" text, "standard_unit" text, "property_level" integer, "parent_property_id" uuid, "category_id" uuid NOT NULL, CONSTRAINT "UQ_soil_properties_slug" UNIQUE ("slug"), CONSTRAINT "UQ_soil_properties_property_name" UNIQUE ("property_name"), CONSTRAINT "CHK_188f69807f9e9e83f7220b272b" CHECK ((("property_level" >= 1) AND ("property_level" <= 5))), CONSTRAINT "PK_soil_properties_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "datasets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "name" text NOT NULL, "full_name" text, "version" text, "author" text, "description" text, "data_producer" text, "variables_measured" jsonb array, "spatial_resolution" text, "publication_date" date, "reference_period_start" text, "reference_period_stop" text, "licenses" uuid array, "citation" text, "geographical_extent" text, "gis_datatype" text, "spatial_extent" geometry(Polygon,4326), "n_observations" bigint, "n_raster_layers" integer, "soil_depth" jsonb, "status" text NOT NULL DEFAULT 'PENDING', "created_by" text NOT NULL, "updated_by" text, "service_location" text, CONSTRAINT "UQ_datasets_slug" UNIQUE ("slug"), CONSTRAINT "PK_datasets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_datasets_name_WHERE_deleted_at_IS_NULL" ON "datasets" ("name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_datasets_spatial_extent" ON "datasets" USING GiST ("spatial_extent") `);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      ['database', process.env.POSTGRES_SCHEMA, 'features', 'GENERATED_COLUMN', 'geom_hash', "(encode(sha256(geom::TEXT::BYTEA), 'hex'))"],
    );
    await queryRunner.query(
      `CREATE TABLE "features" ("id" uuid NOT NULL DEFAULT uuidv7(), "geom" geometry, "geom_hash" text GENERATED ALWAYS AS (encode(sha256(geom::TEXT::BYTEA), 'hex')) STORED NOT NULL, CONSTRAINT "UQ_features_geom_hash" UNIQUE ("geom_hash"), CONSTRAINT "PK_features_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_features_geom" ON "features" USING GiST ("geom") `);
    await queryRunner.query(
      `CREATE TABLE "licenses" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "name" text NOT NULL, "slug" text NOT NULL, "full_name" text, "url" text, CONSTRAINT "UQ_licenses_slug" UNIQUE ("slug"), CONSTRAINT "UQ_licenses_name" UNIQUE ("name"), CONSTRAINT "PK_licenses_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "license" uuid, "sampling_date" date, "min_depth" integer, "max_depth" integer, "horizon" text, CONSTRAINT "PK_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_layers_sampling_date" ON "layers" ("sampling_date") `);
    await queryRunner.query(
      `CREATE TABLE "dataset_layers" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_id" uuid NOT NULL, "layer_id" uuid NOT NULL, "feature_id" uuid NOT NULL, "soil_property_id" uuid NOT NULL, CONSTRAINT "UQ_dataset_layers_dataset_id_feature_id_layer_id_soil_property_id" UNIQUE ("dataset_id", "feature_id", "layer_id", "soil_property_id"), CONSTRAINT "PK_dataset_layers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "procedures" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "sample_pretreatment" text, "technique" "procedures_technique_enum", "extractant_formulation" text, "extractant_concentration" text, "extraction_ratio" text, "extraction_base" text, "instrument" text, "limit_of_detection" text, CONSTRAINT "PK_procedures_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "observations" ("id" uuid NOT NULL DEFAULT uuidv7(), "dataset_layer_id" uuid NOT NULL, "value" numeric NOT NULL, "procedure_id" uuid, CONSTRAINT "PK_observations_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_observations_dataset_layer_id" ON "observations" ("dataset_layer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_observations_procedure_id" ON "observations" ("procedure_id") `);
    await queryRunner.query(
      `CREATE TABLE "jsonstorage" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" character varying NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_jsonstorage_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "files" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "name" text NOT NULL, "file_path" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "created_by" text NOT NULL, "updated_by" text, CONSTRAINT "UQ_files_slug" UNIQUE ("slug"), CONSTRAINT "UQ_files_name" UNIQUE ("name"), CONSTRAINT "PK_files_id" PRIMARY KEY ("id"))`,
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
      `CREATE TABLE "dataset_file_mappings" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "data_mapping_id" uuid NOT NULL, "file_id" uuid, "dataset_id" uuid, CONSTRAINT "UQ_dataset_file_mappings_data_mapping_id_file_id_dataset_id" UNIQUE ("data_mapping_id", "file_id", "dataset_id"), CONSTRAINT "PK_dataset_file_mappings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ADD CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
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
      `ALTER TABLE "observations" ADD CONSTRAINT "FK_observations_dataset_layer_id_dataset_layers_id" FOREIGN KEY ("dataset_layer_id") REFERENCES "dataset_layers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
    await queryRunner.query(`CREATE INDEX idx_geometry_geography ON "features" USING gist (((geom)::geography))`);
    await queryRunner.query(`CREATE INDEX idx_geometry_type ON "features" USING btree (st_geometrytype(geom))`);
    await queryRunner.query(`CREATE INDEX idx_layers_depthrange on "layers" using gist(int4range(min_depth, max_depth))`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" 
      ADD CONSTRAINT "UQ_unit_conversions_original_unit_of_measurement_standard_unit_conversion_formula" UNIQUE NULLS NOT DISTINCT (original_unit_of_measurement, standard_unit, conversion_formula)`);
    await queryRunner.query(`ALTER TABLE "layers" 
      ADD CONSTRAINT "UQ_layers_license_sampling_date_min_depth_max_depth_horizon" UNIQUE NULLS NOT DISTINCT (license, sampling_date, min_depth, max_depth, horizon)`);
    await queryRunner.query(`ALTER TABLE "observations" 
      ADD CONSTRAINT "UQ_observations_dataset_layer_id_value_procedure_id" unique NULLS NOT distinct (dataset_layer_id, value, procedure_id)`);
    await queryRunner.query(`ALTER TABLE "procedures" 
      ADD CONSTRAINT "UQ_procedures_sample_pretreatment_technique_extractant_formulation_extractant_concentration_extraction_ratio_extraction_base_instrument_limit_of_detection" UNIQUE NULLS NOT DISTINCT (sample_pretreatment, technique, extractant_formulation, extractant_concentration, extraction_ratio, extraction_base, instrument, limit_of_detection)`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION check_std_unit(unit_name text) 
      RETURNS bool AS 
      $func$ 
          SELECT EXISTS (SELECT 1 FROM "soil_properties" WHERE COALESCE(standard_unit, '') = coalesce($1, ''));
           $func$  LANGUAGE sql STABLE;`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ADD CONSTRAINT check_standard_unit_exists 
      CHECK (check_std_unit(standard_unit)) NOT VALID;`);
    // TODO: implement this with typeorm entity subscribers
    /* eslint-disable */
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent" SCHEMA public`);
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
                                          'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE slug = %L)',
                                          TG_TABLE_SCHEMA,
                                          TG_TABLE_NAME,
                                          lv_new_slug
                                        ) into lv_exists;
                                        -- Check if the slug already exists
                                        WHILE lv_exists LOOP
                                        -- If it exists, append a number and increment
                                            lv_new_slug := lv_base_slug || '-' || lv_counter;
                                            lv_counter := lv_counter + 1;
                                            EXECUTE format(
                                              'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE slug = %L)',
                                              TG_TABLE_SCHEMA,
                                              TG_TABLE_NAME,
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
    await queryRunner.query(`CREATE OR REPLACE TRIGGER dataset_slug
                                        BEFORE INSERT OR update of name ON datasets
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`CREATE or replace TRIGGER property_slug
                                        BEFORE INSERT OR update of property_name ON soil_properties
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.property_name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER procedure_slug
                                        BEFORE INSERT OR update ON procedures
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.sample_pretreatment,$1.technique,$1.extractant_formulation,$1.extractant_concentration,$1.extraction_ratio,$1.extraction_base,$1.instrument,$1.limit_of_detection}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER property_category_slug
                                        BEFORE INSERT OR update of category_name ON soil_property_categories
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.category_name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER unit_conversion_slug
                                        BEFORE INSERT OR update ON unit_conversions
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.original_unit_of_measurement,$1.standard_unit}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER license_slug
                                        BEFORE INSERT OR update of name ON licenses
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER file_slug
                                        BEFORE INSERT OR update of name ON files
                                        FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
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
      `ALTER TABLE "licenses" DROP CONSTRAINT "FK_licenses_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT "FK_procedures_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
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
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" DROP CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
    );
    await queryRunner.query(`DROP TABLE "dataset_file_mappings"`);
    await queryRunner.query(`DROP TABLE "data_mappings"`);
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(`DROP TABLE "jsonstorage"`);
    await queryRunner.query(`DROP TABLE "observations"`);
    await queryRunner.query(`DROP TABLE "procedures"`);
    await queryRunner.query(`DROP TABLE "dataset_layers"`);
    await queryRunner.query(`DROP TABLE "layers"`);
    await queryRunner.query(`DROP TABLE "licenses"`);
    await queryRunner.query(`DROP TABLE "features"`);
    await queryRunner.query(`DROP TABLE "datasets"`);
    await queryRunner.query(`DROP TABLE "soil_properties"`);
    await queryRunner.query(`DROP TABLE "soil_property_categories"`);
    await queryRunner.query(`DROP TABLE "unit_conversions"`);
    await queryRunner.query(`DROP TABLE "slug_history"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'geom_hash', 'database', process.env.POSTGRES_SCHEMA, 'features'],
    );
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'data_mapping_hash', 'database', process.env.POSTGRES_SCHEMA, 'data_mappings'],
    );
    await queryRunner.query(`DROP TYPE "slug_history_entity_type_enum"`);
    await queryRunner.query(`DROP TYPE "procedures_technique_enum"`);
    await queryRunner.query(`ALTER TABLE "features" RESET (
                    autovacuum_vacuum_insert_scale_factor,
                    autovacuum_analyze_scale_factor,
                    autovacuum_vacuum_scale_factor
                )`);
    await queryRunner.query(`ALTER TABLE "layers" RESET (
                    autovacuum_vacuum_insert_scale_factor,
                    autovacuum_analyze_scale_factor,
                    autovacuum_vacuum_scale_factor
                )`);
    await queryRunner.query(`ALTER TABLE "observations" RESET (
                    autovacuum_vacuum_insert_scale_factor,
                    autovacuum_analyze_scale_factor,
                    autovacuum_vacuum_scale_factor
                )`);
    await queryRunner.query(`DROP INDEX idx_geometry_geography`);
    await queryRunner.query(`DROP INDEX idx_geometry_type`);
    await queryRunner.query(`DROP INDEX idx_layers_depthrange`);

    await queryRunner.query(`ALTER TABLE "unit_conversions" DROP CONSTRAINT unit_conversions_unq`);
    await queryRunner.query(`ALTER TABLE "layers" DROP CONSTRAINT layers_unq`);
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT observations_unq`);
    await queryRunner.query(`ALTER TABLE "procedures" DROP CONSTRAINT procedures_unq`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" DROP CONSTRAINT check_standard_unit_exists`);
    await queryRunner.query(`DROP FUNCTION check_std_unit`);
    await queryRunner.query(`DROP TRIGGER dataset_slug ON datasets`);
    await queryRunner.query(`DROP TRIGGER property_slug ON soil_properties`);
    await queryRunner.query(`DROP TRIGGER procedure_slug ON procedures`);
    await queryRunner.query(`DROP TRIGGER property_category_slug ON property_categories`);
    await queryRunner.query(`DROP TRIGGER unit_conversion_slug ON unit_conversions`);
    await queryRunner.query(`DROP TRIGGER license_slug ON licenses`);
    await queryRunner.query(`DROP TRIGGER file_slug ON files`);
    await queryRunner.query(`DROP FUNCTION slug_generate_store_old`);
    await queryRunner.query(`DROP FUNCTION slugify`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "unaccent"`);
  }
}
