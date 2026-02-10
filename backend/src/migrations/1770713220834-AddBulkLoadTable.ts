import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulkLoadTable1770713220834 implements MigrationInterface {
  name = 'AddBulkLoadTable1770713220834';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TABLE "bulk_load" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "dataset_id" text NOT NULL, "status" text NOT NULL DEFAULT 'pending', "progress_percentage" numeric NOT NULL DEFAULT '0', "progress_description" text, "created_by" text NOT NULL, "updated_by" text, "completed_at" TIMESTAMP, "failed_at" TIMESTAMP, CONSTRAINT "PK_bulk_load_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE "bulk_load"`);
  }
}
