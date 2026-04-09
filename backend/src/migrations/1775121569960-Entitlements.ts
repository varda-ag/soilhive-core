import { MigrationInterface, QueryRunner } from 'typeorm';

export class Entitlements1775121569960 implements MigrationInterface {
  name = 'Entitlements1775121569960';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`CREATE TYPE "visibility_enum" AS ENUM('public', 'private')`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "visibility" "visibility_enum" NOT NULL DEFAULT 'private'`);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "entitlements" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "id" text NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_entitlements_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entitlements_data_gin" ON "entitlements" USING GIN (data);`);
    await queryRunner.query(`UPDATE "datasets" SET "status" = 'LOADED' WHERE "status" = 'INGESTED'`);
    await queryRunner.query(`UPDATE "datasets" SET "status" = 'PUBLISHED' WHERE "status" = 'RELEASED'`);
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" DROP CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_property_categories" DROP CONSTRAINT "FK_soil_property_categories_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_properties" DROP CONSTRAINT "FK_soil_properties_id_id_slug_slug_slug_history_slug_entity_id_entity_id_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "datasets" DROP CONSTRAINT "FK_datasets_id_id_slug_slug_slug_history_slug_entity_id_slug_entity_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "licenses" DROP CONSTRAINT "FK_licenses_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT "FK_procedures_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`,
    );
    await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT "FK_files_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id"`);
    // TODO: fix duplicated slugs
    // await queryRunner.query(`ALTER TABLE "slug_history" DROP CONSTRAINT "PK_slug_history_entity_id_slug"`);
    // await queryRunner.query(`ALTER TABLE "slug_history" ADD CONSTRAINT "PK_slug_history_slug" PRIMARY KEY ("slug")`);
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
           SELECT ARRAY[pv1.name, t.technique::text, pv2.name, pv3.name, pv4.name, pv4.name, pv6.name, pv7.name]
           INTO lv_values_names
            FROM (SELECT NEW.*) AS t 
            LEFT JOIN vocabulary pv1 ON NEW.sample_pretreatment_id=pv1.id and pv1.category='sample_pretreatment'
            LEFT JOIN vocabulary pv2 ON NEW.laboratory_method_id=pv2.id and pv2.category='laboratory_method'
            LEFT JOIN vocabulary pv3 ON NEW.extractant_concentration_id=pv3.id and pv3.category='extractant_concentration'
            LEFT JOIN vocabulary pv4 ON NEW.extraction_ratio_id=pv4.id and pv4.category='extraction_ratio'
            LEFT JOIN vocabulary pv5 ON NEW.extraction_base_id=pv5.id and pv5.category='extraction_base'
            LEFT JOIN vocabulary pv6 ON NEW.measurement_procedure_id=pv6.id and pv6.category='measurement_procedure'
            LEFT JOIN vocabulary pv7 ON NEW.limit_of_detection_id=pv7.id and pv7.category='limit_of_detection';
           
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
    await queryRunner.query(`CREATE OR REPLACE TRIGGER unit_conversion_slug
                                          BEFORE INSERT OR update ON unit_conversions
                                          FOR EACH ROW EXECUTE PROCEDURE slug_unit_conversions_generate_store_old()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    // await queryRunner.query(`ALTER TABLE "slug_history" DROP CONSTRAINT "PK_slug_history_slug"`);
    // await queryRunner.query(`ALTER TABLE "slug_history" ADD CONSTRAINT "PK_slug_history_entity_id_slug" PRIMARY KEY ("entity_id", "slug")`);
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ADD CONSTRAINT "FK_unit_conversions_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(
      `ALTER TABLE "soil_property_categories" ADD CONSTRAINT "FK_soil_property_categories_id_id_slug_slug_slug_history_entity_id_slug_entity_id_slug" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
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
      `ALTER TABLE "files" ADD CONSTRAINT "FK_files_id_id_slug_slug_slug_history_entity_id_slug_slug_entity_id" FOREIGN KEY ("id", "slug") REFERENCES "slug_history"("entity_id","slug") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(`UPDATE "datasets" SET "status" = 'INGESTED' WHERE "status" = 'LOADED'`);
    await queryRunner.query(`UPDATE "datasets" SET "status" = 'RELEASED' WHERE "status" = 'PUBLISHED'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entitlements_data_gin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entitlements"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "visibility"`);
    await queryRunner.query(`DROP TYPE "visibility_enum"`);
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
           SELECT ARRAY[pv1.name, t.technique::text, pv2.name, pv3.name, pv4.name, pv4.name, pv6.name, pv7.name]
           INTO lv_values_names
            FROM (SELECT NEW.*) AS t 
            LEFT JOIN vocabulary pv1 ON NEW.sample_pretreatment_id=pv1.id and pv1.category='sample_pretreatment'
            LEFT JOIN vocabulary pv2 ON NEW.laboratory_method_id=pv2.id and pv2.category='laboratory_method'
            LEFT JOIN vocabulary pv3 ON NEW.extractant_concentration_id=pv3.id and pv3.category='extractant_concentration'
            LEFT JOIN vocabulary pv4 ON NEW.extraction_ratio_id=pv4.id and pv4.category='extraction_ratio'
            LEFT JOIN vocabulary pv5 ON NEW.extraction_base_id=pv5.id and pv5.category='extraction_base'
            LEFT JOIN vocabulary pv6 ON NEW.measurement_procedure_id=pv6.id and pv6.category='measurement_procedure'
            LEFT JOIN vocabulary pv7 ON NEW.limit_of_detection_id=pv7.id and pv7.category='limit_of_detection';
           
            EXECUTE format('SELECT %I.slugify(concat_ws(''-'', %L))', TG_TABLE_SCHEMA, array_to_string(lv_values_names, ', ')) into lv_base_slug;
           lv_new_slug := lv_base_slug;

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
           -- Schema-qualify slug_history + enum type
           EXECUTE format(
             'INSERT INTO %I.slug_history(entity_id, entity_type, slug) VALUES ($1, $2::%I.slug_history_entity_type_enum, $3)',
             TG_TABLE_SCHEMA,
             TG_TABLE_SCHEMA
           ) USING NEW.id, TG_TABLE_NAME, NEW.slug;
           RETURN NEW;
           end;
       $function$`);
  }
}
