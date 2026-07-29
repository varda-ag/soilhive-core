import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayerBand1785200000000 implements MigrationInterface {
  name = 'RasterLayerBand1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A raster layer now names one band of one file, so (file_id, band) is its identity.
    // Existing rows all become band 1 — which collides if a file was ever ingested twice
    // (nothing prevented that before this migration). Check first: a raw index violation
    // on a column that did not exist a moment ago is a confusing thing to hit mid-deploy.
    const duplicates: { file_id: string; count: string }[] = await queryRunner.query(
      `SELECT file_id, COUNT(*)::text AS count
       FROM "raster_layers"
       WHERE deleted_at IS NULL
       GROUP BY file_id
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC`,
    );
    if (duplicates.length > 0) {
      const detail = duplicates.map(d => `${d.file_id} (${d.count} layers)`).join(', ');
      throw new Error(
        `Cannot add unique (file_id, band) to raster_layers: ${duplicates.length} file(s) already have more than one raster layer — ${detail}. ` +
          `These predate per-band ingestion and are indistinguishable once every row becomes band 1. ` +
          `Resolve them (keep one layer per file, or assign distinct bands by hand) before running this migration.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "raster_layers" ADD COLUMN IF NOT EXISTS "band" int NOT NULL DEFAULT 1`);

    // Partial, matching the style of the datasets name constraint: a soft-deleted layer
    // must not block re-ingesting the same band.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_raster_layers_file_id_band" ON "raster_layers" ("file_id", "band") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_raster_layers_file_id_band"`);
    await queryRunner.query(`ALTER TABLE "raster_layers" DROP COLUMN IF EXISTS "band"`);
  }
}
