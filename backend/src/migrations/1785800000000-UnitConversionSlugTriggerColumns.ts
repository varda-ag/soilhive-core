import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Narrows `unit_conversion_slug` to fire only when `property_id`/`original_unit_of_measurement`
 * are the columns being updated, matching how `procedure_slug` was already scoped to its own
 * identity columns.
 *
 * Without the column list, the trigger fires — and unconditionally regenerates the slug — on
 * *any* update, including one that only touches `conversion_formula`/`type`/`metadata`, which is
 * exactly what syncVocabularies()'s `ON CONFLICT DO UPDATE` does on every CSV re-sync. Since
 * property_id/original_unit_of_measurement haven't actually changed in that case, the "new" slug is
 * identical to the current one — which is already in slug_history — so the generator's own
 * already-exists check appends `-1` (see 1785700000000-UnitConversionTypeEnum.ts, which had to
 * `DISABLE TRIGGER` around its own UPDATE for the same reason). Left as-is, every routine sync of
 * an existing row would corrupt its slug a little further.
 *
 * Also adds the unique index `VocabularyEntity` already declares (`@Index(['category', 'name'], {
 * unique: true, where: 'deleted_at IS NULL' })`) but that CreateSchema never actually created —
 * only `(id, category)` exists in the database. Without it, an `ON CONFLICT (category, name)`
 * upsert (syncVocabularies' syncProcedures) has no constraint to target and fails at runtime with
 * "no unique or exclusion constraint matching the ON CONFLICT specification".
 */
export class UnitConversionSlugTriggerColumns1785800000000 implements MigrationInterface {
  name = 'UnitConversionSlugTriggerColumns1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
