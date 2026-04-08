import { MigrationInterface, QueryRunner } from 'typeorm';

export class FileName1775551157964 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "UQ_files_name"`);
    await queryRunner.query(`ALTER TABLE "files" ADD CONSTRAINT "UQ_files_file_path" UNIQUE ("file_path")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE "files" ADD CONSTRAINT "UQ_files_name" UNIQUE ("name")`);
    await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "UQ_files_file_path"`);
  }
}
