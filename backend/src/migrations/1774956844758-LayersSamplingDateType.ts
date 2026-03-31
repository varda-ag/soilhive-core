import { MigrationInterface, QueryRunner } from 'typeorm';

export class LayersSamplingDateType1774956844758 implements MigrationInterface {
  name = 'LayersSamplingDateType1774956844758';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_layers_sampling_date"`);
    await queryRunner.query(`ALTER TABLE "layers" ALTER COLUMN "sampling_date" TYPE TEXT USING TO_CHAR("sampling_date", 'YYYY-MM-DD')`);
    await queryRunner.query(
      `ALTER TABLE "layers" ADD CONSTRAINT chk_date_format CHECK ("sampling_date" ~ '^\\d{4}$' OR "sampling_date" ~ '^\\d{4}-\\d{2}$' OR "sampling_date" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_layers_sampling_date" ON "layers"("sampling_date")`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD COLUMN "processing_steps" JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_layers_sampling_date"`);
    await queryRunner.query(`ALTER TABLE "layers" DROP CONSTRAINT IF EXISTS chk_date_format`);
    await queryRunner.query(`ALTER TABLE "layers" ALTER COLUMN "sampling_date" TYPE DATE USING "sampling_date"::date`);
    await queryRunner.query(`CREATE INDEX "IDX_layers_sampling_date" ON "layers"("sampling_date")`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN "processing_steps"`);
  }
}
