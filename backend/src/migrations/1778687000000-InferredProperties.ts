import { MigrationInterface, QueryRunner } from 'typeorm';

export class InferredProperties1778687000000 implements MigrationInterface {
  name = 'InferredProperties1778687000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "inferred_properties" text[]`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "inferred_properties"`);
  }
}
