import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds CATEGORY_MAPPING to the unit conversion types — for lookup-code conversions rather than
 * measurements, where a raster whose bands carry classes must be resampled with nearest neighbour,
 * never averaged (RasterIngestService).
 *
 * The enum is swapped rather than widened with `ALTER TYPE ... ADD VALUE`: migrations all share one
 * transaction (`runMigrations()` defaults to `transaction: 'all'`), and a value added that way
 * cannot be *used* in the transaction that added it, which would break any later migration in the
 * same run that needs to write it.
 *
 * Reclassifying which conversions actually use CATEGORY_MAPPING no longer lives here: that's now
 * driven by `conversion_type` in `5b-conversion-rules-table.csv` and applied by syncVocabularies()
 * on every boot, the same as any other value in that CSV.
 */
export class UnitConversionTypeEnum1785700000000 implements MigrationInterface {
  name = 'UnitConversionTypeEnum1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // On a fresh schema this runs in the same transaction as CreateSchema, whose seed insert left a
    // deferred FK check event queued per unit_conversions row (both of the table's FKs are
    // DEFERRABLE INITIALLY DEFERRED). Postgres refuses to ALTER TABLE a relation with pending
    // trigger events, so the queue is drained here first; the mode is restored below so a migration
    // appended after this one still gets end-of-transaction checks.
    await queryRunner.query(`SET CONSTRAINTS ALL IMMEDIATE`);

    await queryRunner.query(`ALTER TYPE "unit_conversions_type_enum" RENAME TO "unit_conversions_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "unit_conversions_type_enum" AS ENUM('IDENTITY', 'SIMPLE', 'CONDITIONAL', 'CATEGORY_MAPPING')`);
    // Dropped first: the default still carries the renamed type, which has no cast to the new one.
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ALTER "type" TYPE "unit_conversions_type_enum" USING "type"::text::"unit_conversions_type_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" SET DEFAULT 'IDENTITY'::"unit_conversions_type_enum"`);
    await queryRunner.query(`DROP TYPE "unit_conversions_type_enum_old"`);

    await queryRunner.query(`SET CONSTRAINTS ALL DEFERRED`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET CONSTRAINTS ALL IMMEDIATE`);
    // Any row still classified CATEGORY_MAPPING (via syncVocabularies(), not this migration) has
    // no value to fall back to in the narrowed enum below — reclassifying is syncVocabularies()'s
    // job now, but the enum swap itself still needs every row off the value it's about to drop.
    // Trigger disabled around this UPDATE regardless: if 1785800000000 (which scopes
    // unit_conversion_slug to property_id/original_unit_of_measurement) has already been reverted
    // by the time this runs, the trigger is back to firing on any UPDATE and would corrupt the slug
    // the same way this migration originally had to guard against.
    await queryRunner.query(`ALTER TABLE "unit_conversions" DISABLE TRIGGER "unit_conversion_slug"`);
    await queryRunner.query(`UPDATE "unit_conversions" SET "type" = 'IDENTITY' WHERE "type" = 'CATEGORY_MAPPING'`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ENABLE TRIGGER "unit_conversion_slug"`);

    await queryRunner.query(`ALTER TYPE "unit_conversions_type_enum" RENAME TO "unit_conversions_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "unit_conversions_type_enum" AS ENUM('IDENTITY', 'SIMPLE', 'CONDITIONAL')`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "unit_conversions" ALTER "type" TYPE "unit_conversions_type_enum" USING "type"::text::"unit_conversions_type_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" SET DEFAULT 'IDENTITY'::"unit_conversions_type_enum"`);
    await queryRunner.query(`DROP TYPE "unit_conversions_type_enum_old"`);

    await queryRunner.query(`SET CONSTRAINTS ALL DEFERRED`);
  }
}
