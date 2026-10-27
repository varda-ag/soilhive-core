import { MigrationInterface, QueryRunner } from 'typeorm';

// Ground width of one degree of longitude at the equator, as analyzeRasterMeta measures a geographic raster's resolution_m
const METRES_PER_DEGREE = 111320;

/**
 * Columns for Raster Filter Installation through the API (docs/adr/0066, docs/adr/0067).
 *
 * Rows CreateSchema seeded for the CLI to fill, but that never got a table, are deleted: nothing can
 * install into them any more, and they hold the ids an admin would pick. Installed rows are backfilled.
 */
export class RasterFilterInstallation1793112480000 implements MigrationInterface {
  name = 'RasterFilterInstallation1793112480000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "raster_filters" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'categorical'`);
    await queryRunner.query(`ALTER TABLE "raster_filters" ADD COLUMN IF NOT EXISTS "file_id" uuid`);
    await queryRunner.query(`ALTER TABLE "raster_filters" ADD COLUMN IF NOT EXISTS "created_by" text`);
    await queryRunner.query(`ALTER TABLE "raster_filters" ADD COLUMN IF NOT EXISTS "resolution_m" int`);
    await queryRunner.query(`ALTER TABLE "raster_filters" ADD COLUMN IF NOT EXISTS "pixel_values" jsonb`);
    // A new filter stays hidden until an admin activates it
    await queryRunner.query(`ALTER TABLE "raster_filters" ALTER COLUMN "active" SET DEFAULT false`);
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace WHERE con.conname = 'CHK_raster_filters_kind' AND nsp.nspname = current_schema()) THEN
           ALTER TABLE "raster_filters" ADD CONSTRAINT "CHK_raster_filters_kind" CHECK ("kind" IN ('categorical', 'continuous'));
         END IF;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace WHERE con.conname = 'FK_raster_filters_file_id_files_id' AND nsp.nspname = current_schema()) THEN
           ALTER TABLE "raster_filters" ADD CONSTRAINT "FK_raster_filters_file_id_files_id" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
         END IF;
       END $$`,
    );

    await queryRunner.query(
      `DELETE FROM "raster_filters" rf
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema() AND c.relname = rf.id AND c.relkind IN ('r', 'p')
       )`,
    );

    const installed: { id: string }[] = await queryRunner.query(`SELECT id FROM "raster_filters" WHERE "resolution_m" IS NULL`);
    for (const { id } of installed) {
      // Every CLI dump was in EPSG:4326, so the pixel width is in degrees
      await queryRunner.query(
        `UPDATE "raster_filters"
         SET "resolution_m" = (SELECT round(abs(ST_PixelWidth(rast)) * ${METRES_PER_DEGREE})::int FROM "${id.replace(/"/g, '""')}" LIMIT 1)
         WHERE id = $1`,
        [id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The deleted seed rows are not restored: they had no table, so nothing referenced them
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP CONSTRAINT IF EXISTS "FK_raster_filters_file_id_files_id"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP CONSTRAINT IF EXISTS "CHK_raster_filters_kind"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" ALTER COLUMN "active" SET DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP COLUMN IF EXISTS "pixel_values"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP COLUMN IF EXISTS "resolution_m"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP COLUMN IF EXISTS "created_by"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP COLUMN IF EXISTS "file_id"`);
    await queryRunner.query(`ALTER TABLE "raster_filters" DROP COLUMN IF EXISTS "kind"`);
  }
}
