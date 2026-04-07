import { MigrationInterface, QueryRunner } from 'typeorm';

export class Entitlements1775121569960 implements MigrationInterface {
  name = 'Entitlements1775121569960';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`CREATE TYPE "visibility_enum" AS ENUM('public', 'private')`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN IF NOT EXISTS "visibility" "visibility_enum" NOT NULL DEFAULT 'private'`);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "entitlements" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "id" text NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_entitlements_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_entitlements_data_gin" ON "entitlements" USING GIN (data);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entitlements_data_gin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entitlements"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN IF EXISTS "visibility"`);
    await queryRunner.query(`DROP TYPE "visibility_enum"`);
  }
}
