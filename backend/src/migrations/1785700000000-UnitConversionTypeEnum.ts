import { MigrationInterface, QueryRunner } from "typeorm";

export class UnitConversionTypeEnum1785700000000 implements MigrationInterface {
  name = 'UnitConversionTypeEnum1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "unit_conversions_type_enum" ADD VALUE IF NOT EXISTS 'CATEGORY_MAPPING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" TYPE TEXT`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" SET DEFAULT 'IDENTITY'`);
    // Set default type where type is "CATEGORY_MAPPING"
    await queryRunner.query(`UPDATE "unit_conversions" SET "type"='IDENTITY' WHERE "type"='CATEGORY_MAPPING'`);
    await queryRunner.query(`DROP TYPE "unit_conversions_type_enum"`);
    await queryRunner.query(`CREATE TYPE "unit_conversions_type_enum" AS ENUM('IDENTITY', 'SIMPLE', 'CONDITIONAL')`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" SET DEFAULT 'IDENTITY'::"unit_conversions_type_enum"`);
    await queryRunner.query(`ALTER TABLE "unit_conversions" ALTER "type" TYPE "unit_conversions_type_enum" USING "type"::"unit_conversions_type_enum"`);
  }
}
