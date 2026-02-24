import { MigrationInterface, QueryRunner } from 'typeorm';

export class FilePath1771860910837 implements MigrationInterface {
  name = 'FilePath1771860910837';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN file_path DROP NOT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN file_path SET NOT NULL;`);
  }
}
