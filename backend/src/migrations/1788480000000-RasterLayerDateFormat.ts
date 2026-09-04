import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterLayerDateFormat1788480000000 implements MigrationInterface {
  name = 'RasterLayerDateFormat1788480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `datasets.reference_period_start` and `_stop` have accepted only a year, a year and month, or
    // a full date since the schema was created; `raster_layers` accepted anything. A Raster Load
    // therefore wrote a malformed period into the layer without complaint and only failed at the
    // very end, rolling the same value up into the Dataset — far from the Band Mapping field that
    // supplied it, and (until the loader learned to check it) with nothing said about which band.
    //
    // The constraint belongs on both tables: `layers.sampling_date` already carries the tabular
    // equivalent, so this closes the raster side of the same rule.
    //
    // Existing malformed values are cleared rather than left behind under a NOT VALID constraint.
    // They are unusable — a Dataset holding one cannot complete a load at all, which is exactly how
    // this surfaced — and a Raster Ingest refreshes reference_period_start/stop from the Band
    // Mapping on every run, so re-running the load restores whatever the corrected mapping says.
    for (const column of ['reference_period_start', 'reference_period_stop']) {
      await queryRunner.query(
        `UPDATE "raster_layers" SET "${column}" = NULL
         WHERE "${column}" IS NOT NULL
           AND NOT ("${column}" ~ '^\\d{4}$' OR "${column}" ~ '^\\d{4}-\\d{2}$' OR "${column}" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "raster_layers" ADD CONSTRAINT chk_raster_layers_date_format_start CHECK ("reference_period_start" ~ '^\\d{4}$' OR "reference_period_start" ~ '^\\d{4}-\\d{2}$' OR "reference_period_start" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "raster_layers" ADD CONSTRAINT chk_raster_layers_date_format_stop CHECK ("reference_period_stop" ~ '^\\d{4}$' OR "reference_period_stop" ~ '^\\d{4}-\\d{2}$' OR "reference_period_stop" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "raster_layers" DROP CONSTRAINT IF EXISTS chk_raster_layers_date_format_start`);
    await queryRunner.query(`ALTER TABLE "raster_layers" DROP CONSTRAINT IF EXISTS chk_raster_layers_date_format_stop`);
  }
}
