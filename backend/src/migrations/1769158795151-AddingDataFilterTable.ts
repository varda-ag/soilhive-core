import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddingDataFilterTable1769158795151 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TABLE "data_filters" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuidv7(), "filter" jsonb NOT NULL, "persistent" boolean NOT NULL DEFAULT false, "name" text, "owner" text, CONSTRAINT "PK_data_filters_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE "data_filters"`);
  }
}
