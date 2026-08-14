import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnitConversionSlugTriggerColumns1786800000000 implements MigrationInterface {
  name = 'UnitConversionSlugTriggerColumns1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // unit_conversion_slug previously fired on any UPDATE, so syncUnitConversions's DO UPDATE SET
    // conversion_formula/type/metadata (none of them the slug source) re-fired it every no-op sync,
    // drifting the slug. Scoping to the actual slug-source columns fixes that at the source.
    await queryRunner.query(`CREATE OR REPLACE TRIGGER "unit_conversion_slug"
                                        BEFORE INSERT OR UPDATE OF property_id, original_unit_of_measurement ON "unit_conversions"
                                        FOR EACH ROW EXECUTE PROCEDURE slug_unit_conversions_generate_store_old()`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_vocabulary_category_name_WHERE_deleted_at_IS_NULL" ON "vocabulary" ("category", "name") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_vocabulary_category_name_WHERE_deleted_at_IS_NULL"`);

    await queryRunner.query(`CREATE OR REPLACE TRIGGER "unit_conversion_slug"
                                        BEFORE INSERT OR update ON "unit_conversions"
                                        FOR EACH ROW EXECUTE PROCEDURE slug_unit_conversions_generate_store_old()`);
  }
}
