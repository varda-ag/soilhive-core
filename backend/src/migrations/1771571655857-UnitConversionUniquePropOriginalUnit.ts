import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1771571655857 implements MigrationInterface {
  name = 'UnitConversion-PropOriginalUnitUnique1771571655857';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `ALTER TABLE unit_conversions ADD CONSTRAINT "UQ_unit_conversions_property_id_original_unit_of_measurement" UNIQUE ("property_id", "original_unit_of_measurement")`,
    );
    await queryRunner.query(`ALTER TABLE datasets ALTER COLUMN "licenses" TYPE text[]`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE unit_conversions DROP CONSTRAINT "UQ_unit_conversions_property_id_original_unit_of_measurement"`);
    await queryRunner.query(`ALTER TABLE datasets ALTER COLUMN "licenses" TYPE uuid[]`);
  }
}
