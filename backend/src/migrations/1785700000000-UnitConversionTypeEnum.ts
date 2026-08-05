import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds CATEGORY_MAPPING to the unit conversion types, and reclassifies the two seeded conversions
 * that are lookup codes rather than measurements — a raster whose bands carry classes must be
 * resampled with nearest neighbour, never averaged (RasterIngestService).
 *
 * The enum is swapped rather than widened with `ALTER TYPE ... ADD VALUE`: migrations all share one
 * transaction (`runMigrations()` defaults to `transaction: 'all'`), and a value added that way
 * cannot be *used* in the transaction that added it, so the UPDATE below would fail on every
 * database whose enum was created by an earlier, already-committed run.
 *
 * The reclassification lives here rather than in `2_unit_conversions_data_insert.sql` for the same
 * reason: that seed only runs on a fresh schema, so it would never reach an existing database.
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

    // unit_conversion_slug is BEFORE INSERT OR UPDATE with no column list, and regenerates the slug
    // unconditionally: left enabled it would rename both rows to '<slug>-1', because their current
    // slug is already in slug_history. Rolled back with the transaction if the UPDATE fails.
    await queryRunner.query(`ALTER TABLE "unit_conversions" DISABLE TRIGGER "unit_conversion_slug"`);
    await queryRunner.query(
      `UPDATE "unit_conversions" uc SET "type" = 'CATEGORY_MAPPING'
         FROM "soil_properties" sp
        WHERE uc."property_id" = sp."id"
          AND (sp."property_acronym", uc."original_unit_of_measurement") IN (('usda_texture', 'code 1-12'), ('drghtvul', 'dimensionless'))`,
    );
    await queryRunner.query(`ALTER TABLE "unit_conversions" ENABLE TRIGGER "unit_conversion_slug"`);

    await queryRunner.query(`SET CONSTRAINTS ALL DEFERRED`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET CONSTRAINTS ALL IMMEDIATE`);
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
