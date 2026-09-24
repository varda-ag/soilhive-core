import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayerFootprintsFootprintIdIndex1790077382000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_raster_layer_footprints_raster_footprint_id" ON "raster_layer_footprints" ("raster_footprint_id", "raster_layer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_raster_layer_footprints_raster_footprint_id"`);
  }
}
