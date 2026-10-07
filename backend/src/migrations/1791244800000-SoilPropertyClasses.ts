import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Class codes and labels of categorical properties (e.g. USDA texture 1 = Clay). Filled by the
 * vocabulary sync from 4g-soil-property-classes-table.csv, not here.
 */
export class SoilPropertyClasses1791244800000 implements MigrationInterface {
  name = 'SoilPropertyClasses1791244800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "soil_properties" ADD COLUMN IF NOT EXISTS "classes" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "soil_properties" DROP COLUMN IF EXISTS "classes"`);
  }
}
