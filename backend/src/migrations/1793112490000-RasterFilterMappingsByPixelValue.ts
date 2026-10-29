import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS = ['mappings', 'suggested_mappings'];

/**
 * Raster Filter labels are keyed by pixel value, so several values may share a label (docs/adr/0068).
 * Only rows still in the other shape are touched, so a rerun is harmless.
 */
export class RasterFilterMappingsByPixelValue1793112490000 implements MigrationInterface {
  name = 'RasterFilterMappingsByPixelValue1793112490000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      // { label: pixel value } → { pixel value: label }
      await queryRunner.query(
        `UPDATE "raster_filters"
         SET "${column}" = COALESCE((SELECT jsonb_object_agg(e.value, e.key) FROM jsonb_each_text("${column}") e), '{}'::jsonb)
         WHERE "${column}" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM jsonb_each("${column}") e WHERE jsonb_typeof(e.value) <> 'number')`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      // A label shared by several values keeps only one of them
      await queryRunner.query(
        `UPDATE "raster_filters"
         SET "${column}" = COALESCE((SELECT jsonb_object_agg(e.value, e.key::bigint) FROM jsonb_each_text("${column}") e), '{}'::jsonb)
         WHERE "${column}" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM jsonb_each("${column}") e WHERE jsonb_typeof(e.value) <> 'string')`,
      );
    }
  }
}
