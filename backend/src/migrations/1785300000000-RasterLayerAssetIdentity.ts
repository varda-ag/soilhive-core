import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayerAssetIdentity1785300000000 implements MigrationInterface {
  name = 'RasterLayerAssetIdentity1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A Raster Layer Asset is identified by the pair (raster layer, file): a Band Mapping naming
    // the same resource twice, or a Raster Load re-run after a mid-job failure, must not attach
    // the same File to a layer twice.
    //
    // No duplicate check first, unlike the raster_layers band migration: nothing has ever written
    // this table, so there is nothing to collide.
    //
    // Partial, matching UQ_raster_layers_file_id_band: a soft-deleted asset must not block
    // re-attaching the same File to the same layer.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_raster_layer_assets_raster_layer_id_file_id"
       ON "raster_layer_assets" ("raster_layer_id", "file_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_raster_layer_assets_raster_layer_id_file_id"`);
  }
}
