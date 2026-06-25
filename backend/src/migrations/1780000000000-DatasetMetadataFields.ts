import { MigrationInterface, QueryRunner } from 'typeorm';

export class DatasetMetadataFields1780000000000 implements MigrationInterface {
  name = 'DatasetMetadataFields1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "preprocessing_steps" text`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "related_resources" text[]`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "related_resources"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "preprocessing_steps"`);
  }
}
