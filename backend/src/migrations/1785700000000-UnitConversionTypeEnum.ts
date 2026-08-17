import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnitConversionTypeEnum1785700000000 implements MigrationInterface {
  name = 'UnitConversionTypeEnum1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // unit_conversions' two FKs are DEFERRABLE INITIALLY DEFERRED, and Postgres refuses to ALTER
    // TABLE a relation with pending deferred-constraint checks queued — forced immediate here for
    // the ALTERs below, then restored to deferred for whatever runs after.
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
    // The 3-value enum being restored has no CATEGORY_MAPPING — any row still classified that way
    // is reclassified to IDENTITY first, so the type-cast below has somewhere to land it.
    // Trigger disabled for this UPDATE because migrations revert in reverse order: 1785800000000
    // has already been reverted by the time this runs, which restores unit_conversion_slug to
    // firing on any column update — including this type-only one — and would regenerate an
    // unchanged slug.
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
