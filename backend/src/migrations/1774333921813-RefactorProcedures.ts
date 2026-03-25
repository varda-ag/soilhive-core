import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorProcedures1774333921813 implements MigrationInterface {
  name = 'RefactorProcedures1774333921813';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`SET CONSTRAINTS ALL IMMEDIATE`);
    await queryRunner.query(
      `CREATE TYPE "procedures_vocabulary_category_enum" AS ENUM('sample_pretreatment', 'laboratory_method', 'extractant_concentration', 'extraction_ratio', 'extraction_base', 'measurement_procedure', 'limit_of_detection')`,
    );
    await queryRunner.query(
      `CREATE TABLE "procedures_vocabulary" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "slug" text NOT NULL, "category" "procedures_vocabulary_category_enum" NOT NULL, "name" text NOT NULL, CONSTRAINT "UQ_procedures_vocabulary_id_category" UNIQUE ("id", "category"), CONSTRAINT "PK_procedures_vocabulary_id_slug" PRIMARY KEY ("id", "slug"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_procedures_vocabulary_category_id" ON "procedures_vocabulary" ("category", "id")`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER procedures_vocabulary_slug
                                            BEFORE INSERT OR update of name ON procedures_vocabulary
                                            FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.name}')`);
    await queryRunner.query(`DROP TRIGGER "procedure_slug" ON "procedures"`);
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP CONSTRAINT "UQ_procedures_sample_pretreatment_technique_laboratory_method_extractant_concentration_extraction_ratio_extraction_base_measurement_procedure_limit_of_detection"`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD COLUMN "sample_pretreatment_id" uuid, ADD COLUMN "laboratory_method_id" uuid, ADD COLUMN "extractant_concentration_id" uuid, ADD COLUMN "extraction_ratio_id" uuid, ADD COLUMN "extraction_base_id" uuid, ADD COLUMN "measurement_procedure_id" uuid, ADD COLUMN "limit_of_detection_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD COLUMN sample_pretreatment_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('sample_pretreatment'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN laboratory_method_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('laboratory_method'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN extractant_concentration_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('extractant_concentration'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN extraction_ratio_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('extraction_ratio'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN extraction_base_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('extraction_base'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN measurement_procedure_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('measurement_procedure'::"procedures_vocabulary_category_enum") STORED, ADD COLUMN limit_of_detection_category "procedures_vocabulary_category_enum" GENERATED ALWAYS AS ('limit_of_detection'::"procedures_vocabulary_category_enum") STORED`,
    );
    // update slug generating trigger (create func and replace trigger)
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
            LEFT JOIN procedures_vocabulary pv1 ON NEW.sample_pretreatment_id=pv1.id and pv1.category='sample_pretreatment'
            LEFT JOIN procedures_vocabulary pv2 ON NEW.laboratory_method_id=pv2.id and pv2.category='laboratory_method'
            LEFT JOIN procedures_vocabulary pv3 ON NEW.extractant_concentration_id=pv3.id and pv3.category='extractant_concentration'
            LEFT JOIN procedures_vocabulary pv4 ON NEW.extraction_ratio_id=pv4.id and pv4.category='extraction_ratio'
            LEFT JOIN procedures_vocabulary pv5 ON NEW.extraction_base_id=pv5.id and pv5.category='extraction_base'
            LEFT JOIN procedures_vocabulary pv6 ON NEW.measurement_procedure_id=pv6.id and pv6.category='measurement_procedure'
            LEFT JOIN procedures_vocabulary pv7 ON NEW.limit_of_detection_id=pv7.id and pv7.category='limit_of_detection';
           
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
    await queryRunner.query(
      `CREATE OR REPLACE TRIGGER "procedure_slug" BEFORE INSERT OR UPDATE ON "procedures" FOR EACH ROW EXECUTE FUNCTION slug_procedures_generate_store_old()`,
    );
    await queryRunner.query(`INSERT INTO "procedures_vocabulary" ("name", "category")
                SELECT * FROM (
                    SELECT DISTINCT sample_pretreatment, 'sample_pretreatment'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT laboratory_method, 'laboratory_method'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT extractant_concentration, 'extractant_concentration'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT extraction_ratio, 'extraction_ratio'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT extraction_base, 'extraction_base'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT measurement_procedure, 'measurement_procedure'::"procedures_vocabulary_category_enum" FROM "procedures"
                    UNION ALL
                    SELECT DISTINCT limit_of_detection, 'limit_of_detection'::"procedures_vocabulary_category_enum" FROM "procedures") as v("name", "category")
                WHERE "name" IS NOT NULL
        `);
    await queryRunner.query(`UPDATE "procedures" SET sample_pretreatment_id=pv1.id, laboratory_method_id=pv2.id, extractant_concentration_id=pv3.id, extraction_ratio_id=pv4.id, extraction_base_id=pv5.id, measurement_procedure_id=pv6.id, limit_of_detection_id=pv7.id 
                FROM procedures proc
                left join procedures_vocabulary pv1 on pv1.name=proc.sample_pretreatment AND pv1.category='sample_pretreatment'
                left join  procedures_vocabulary pv2 on pv2.name=proc.laboratory_method AND pv2.category='laboratory_method'
                left join  procedures_vocabulary pv3 on pv3.name=proc.extractant_concentration AND pv3.category='extractant_concentration'
                left join  procedures_vocabulary pv4 on pv4.name=proc.extraction_ratio AND pv4.category='extraction_ratio'
                left join  procedures_vocabulary pv5 on pv5.name=proc.extraction_base AND pv5.category='extraction_base'
                left join  procedures_vocabulary pv6 on pv6.name=proc.measurement_procedure AND pv6.category='measurement_procedure'
                left join  procedures_vocabulary pv7 on pv7.name=proc.limit_of_detection AND pv7.category='limit_of_detection'
                where proc.id=procedures.id;`);
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_sample_pretreatment_id_sample_pretreatment_category_procedures_vocabulary_id_category" FOREIGN KEY (sample_pretreatment_id, sample_pretreatment_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_laboratory_method_id_laboratory_method_category_procedures_vocabulary_id_category" FOREIGN KEY (laboratory_method_id, laboratory_method_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extractant_concentration_id_extractant_concentration_category_procedures_vocabulary_id_category" FOREIGN KEY (extractant_concentration_id, extractant_concentration_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extraction_ratio_id_extraction_ratio_category_procedures_vocabulary_id_category" FOREIGN KEY (extraction_ratio_id, extraction_ratio_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_extraction_base_id_extraction_base_category_procedures_vocabulary_id_category" FOREIGN KEY (extraction_base_id, extraction_base_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_measurement_procedure_id_smeasurement_procedure_category_procedures_vocabulary_id_category" FOREIGN KEY (measurement_procedure_id, measurement_procedure_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "FK_procedures_limit_of_detection_id_limit_of_detection_category_procedures_vocabulary_id_category" FOREIGN KEY (limit_of_detection_id, limit_of_detection_category) REFERENCES "procedures_vocabulary"(id, category)`,
    );
    await queryRunner.query(`ALTER TABLE "procedures"
            ADD CONSTRAINT "UQ_procedures_sample_pretreatment_id_technique_laboratory_method_id_extractant_concentration_id_extraction_ratio_id_extraction_base_id_measurement_procedure_id_limit_of_detection_id" UNIQUE NULLS NOT DISTINCT (sample_pretreatment_id, technique, laboratory_method_id, extractant_concentration_id, extraction_ratio_id, extraction_base_id, measurement_procedure_id, limit_of_detection_id)`);
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP COLUMN sample_pretreatment, DROP COLUMN laboratory_method, DROP COLUMN extractant_concentration, DROP COLUMN extraction_ratio, DROP COLUMN extraction_base, DROP COLUMN measurement_procedure, DROP COLUMN limit_of_detection`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD COLUMN "sample_pretreatment" TEXT, ADD COLUMN "laboratory_method" TEXT, ADD COLUMN "extractant_concentration" TEXT, ADD COLUMN "extraction_ratio" TEXT, ADD COLUMN "extraction_base" TEXT, ADD COLUMN "measurement_procedure" TEXT, ADD COLUMN "limit_of_detection" TEXT`,
    );
    await queryRunner.query(`UPDATE "procedures" SET sample_pretreatment=pv1.name, laboratory_method=pv2.name, extractant_concentration=pv3.name, extraction_ratio=pv4.name, extraction_base=pv5.name, measurement_procedure=pv6.name, limit_of_detection=pv7.name 
            FROM procedures proc
            left join procedures_vocabulary pv1 on pv1.id=proc.sample_pretreatment_id AND pv1.category='sample_pretreatment'
            left join  procedures_vocabulary pv2 on pv2.id=proc.laboratory_method_id AND pv2.category='laboratory_method'
            left join  procedures_vocabulary pv3 on pv3.id=proc.extractant_concentration_id AND pv3.category='extractant_concentration'
            left join  procedures_vocabulary pv4 on pv4.id=proc.extraction_ratio_id AND pv4.category='extraction_ratio'
            left join  procedures_vocabulary pv5 on pv5.id=proc.extraction_base_id AND pv5.category='extraction_base'
            left join  procedures_vocabulary pv6 on pv6.id=proc.measurement_procedure_id AND pv6.category='measurement_procedure'
            left join  procedures_vocabulary pv7 on pv7.id=proc.limit_of_detection_id AND pv7.category='limit_of_detection'
            where proc.id=procedures.id`);
    await queryRunner.query(
      `CREATE OR REPLACE TRIGGER "procedure_slug" BEFORE INSERT OR UPDATE ON "procedures" FOR EACH ROW EXECUTE FUNCTION slug_generate_store_old('{$1.sample_pretreatment,$1.technique,$1.laboratory_method,$1.extractant_concentration,$1.extraction_ratio,$1.extraction_base,$1.measurement_procedure,$1.limit_of_detection}')`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" DROP COLUMN "sample_pretreatment_id", DROP COLUMN "laboratory_method_id", DROP COLUMN "extractant_concentration_id", DROP COLUMN "extraction_ratio_id", DROP COLUMN "extraction_base_id", DROP COLUMN "measurement_procedure_id", DROP COLUMN "limit_of_detection_id", DROP COLUMN sample_pretreatment_category, DROP COLUMN laboratory_method_category, DROP COLUMN extractant_concentration_category, DROP COLUMN extraction_ratio_category, DROP COLUMN extraction_base_category, DROP COLUMN measurement_procedure_category, DROP COLUMN limit_of_detection_category`,
    );
    await queryRunner.query(
      `ALTER TABLE "procedures" ADD CONSTRAINT "UQ_procedures_sample_pretreatment_technique_laboratory_method_extractant_concentration_extraction_ratio_extraction_base_measurement_procedure_limit_of_detection"  UNIQUE NULLS NOT DISTINCT (sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection)`,
    );
    await queryRunner.query(`DROP TABLE "procedures_vocabulary"`);
    await queryRunner.query(`DROP TYPE "procedures_vocabulary_category_enum"`);
  }
}
