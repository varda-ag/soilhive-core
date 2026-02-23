import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1771240643027 implements MigrationInterface {
  name = 'UnitConversionsPropertyId1771240643027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE procedures RENAME COLUMN extractant_formulation TO laboratory_method`);
    await queryRunner.query(`ALTER TABLE procedures RENAME COLUMN instrument TO measurement_procedure`);
    await queryRunner.query(
      `ALTER TABLE procedures RENAME CONSTRAINT "UQ_procedures_sample_pretreatment_technique_extractant_formulat" TO "UQ_procedures_sample_pretreatment_technique_laboratory_method_extractant_concentration_extraction_ratio_extraction_base_measurement_procedure_limit_of_detection"`,
    );
    await queryRunner.query(`ALTER TABLE unit_conversions ADD property_id uuid NOT NULL`);
    await queryRunner.query(`ALTER TABLE unit_conversions DROP COLUMN standard_unit`);
    await queryRunner.query(
      `ALTER TABLE unit_conversions ADD CONSTRAINT FK_unit_conversions_property_id_soil_properties_id FOREIGN KEY (property_id) REFERENCES soil_properties(id) ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS check_std_unit`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER procedure_slug
            BEFORE INSERT OR update ON procedures
            FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.sample_pretreatment,$1.technique,$1.laboratory_method,$1.extractant_concentration,$1.extraction_ratio,$1.extraction_base,$1.measurement_procedure,$1.limit_of_detection}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER unit_conversion_slug
            BEFORE INSERT OR update ON unit_conversions
            FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.original_unit_of_measurement,$1.conversion_formula}')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER unit_conversion_slug
            BEFORE INSERT OR update ON unit_conversions
            FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.original_unit_of_measurement,$1.standard_unit}')`);
    await queryRunner.query(`CREATE OR REPLACE TRIGGER procedure_slug
            BEFORE INSERT OR update ON procedures
            FOR EACH ROW EXECUTE PROCEDURE slug_generate_store_old('{$1.sample_pretreatment,$1.technique,$1.extractant_formulation,$1.extractant_concentration,$1.extraction_ratio,$1.extraction_base,$1.instrument,$1.limit_of_detection}')`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION check_std_unit(unit_name text) 
        RETURNS bool AS 
        $func$ 
            SELECT EXISTS (SELECT 1 FROM soil_properties WHERE COALESCE(standard_unit, '') = coalesce($1, ''));
             $func$  LANGUAGE sql STABLE;`);
    await queryRunner.query(`ALTER TABLE unit_conversions ADD standard_unit text`);
    await queryRunner.query(`ALTER TABLE unit_conversions ADD CONSTRAINT check_standard_unit_exists 
            CHECK (check_std_unit(standard_unit)) NOT VALID;`);
    await queryRunner.query(`ALTER TABLE unit_conversions DROP COLUMN property_id`);
    await queryRunner.query(
      `ALTER TABLE procedures RENAME CONSTRAINT "UQ_procedures_sample_pretreatment_technique_laboratory_method_extractant_concentration_extraction_ratio_extraction_base_measurement_procedure_limit_of_detection" TO "UQ_procedures_sample_pretreatment_technique_extractant_formulat"`,
    );
    await queryRunner.query(`ALTER TABLE procedures RENAME COLUMN laboratory_method TO extractant_formulation`);
    await queryRunner.query(`ALTER TABLE procedures RENAME COLUMN measurement_procedure TO instrument`);
  }
}
