import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayerCategorical1786400000000 implements MigrationInterface {
  name = 'RasterLayerCategorical1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "raster_layers" ADD COLUMN IF NOT EXISTS "is_categorical" boolean NOT NULL DEFAULT FALSE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "raster_layers" DROP COLUMN IF EXISTS "is_categorical"`);
  }
}
