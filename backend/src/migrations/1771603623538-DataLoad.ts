import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class CreateSchema1771603623538 implements MigrationInterface {
  name = 'DataLoad1771603623538';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    const base = path.resolve(__dirname, './data');
    const files = [
      '0_licenses_data_insert.sql',
      '0_soil_property_categories_data_insert.sql',
      '1_soil_properties_data_insert.sql',
      '2_unit_conversions_data_insert.sql',
    ];

    for (const file of files) {
      const sql = fs.readFileSync(path.join(base, file), 'utf8');
      await queryRunner.query(sql);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible vocabulary data migration
  }
}
