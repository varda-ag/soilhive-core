import { MigrationInterface, QueryRunner } from 'typeorm';

export class JsonbArray1772001436495 implements MigrationInterface {
  name = 'JsonbArray1772001436495';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `ALTER TABLE datasets ALTER COLUMN variables_measured TYPE jsonb default [] USING COALESCE(jsonb_build_array(variables_measured), '[]'::jsonb);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE datasets ALTER COLUMN variables_measured TYPE jsonb array default [];`);
  }
}
