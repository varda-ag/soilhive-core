import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns delete_orphan_raster_footprints from a row-level into a statement-level trigger. Row-level,
 * a bulk delete of a 9-layer raster dataset fired it 4.1M times (42s of a 51s delete), and larger
 * datasets ran into the bulk-delete statement_timeout.
 *
 * Statement-level AFTER triggers on the same event fire in name order, so trg_delete_orphan_… still
 * runs before trg_refresh_raster_layer_groups_del and the orphans are gone when groups are recomputed.
 *
 * Each orphan it deletes cascades into a 0-row DELETE on raster_layer_footprints, which fires this
 * trigger again with an empty transition table; those firings return early.
 */
export class StatementLevelOrphanFootprintTrigger1791936000000 implements MigrationInterface {
  name = 'StatementLevelOrphanFootprintTrigger1791936000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_delete_orphan_raster_footprints ON raster_layer_footprints`);
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION delete_orphan_raster_footprints() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM changed_links) THEN
           RETURN NULL;
         END IF;

         DELETE FROM raster_footprints rf
         WHERE rf.id IN (SELECT DISTINCT raster_footprint_id FROM changed_links)
           AND NOT EXISTS (
             SELECT 1 FROM raster_layer_footprints rlf WHERE rlf.raster_footprint_id = rf.id
           );
         RETURN NULL;
       END $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_delete_orphan_raster_footprints
       AFTER DELETE ON raster_layer_footprints
       REFERENCING OLD TABLE AS changed_links
       FOR EACH STATEMENT EXECUTE FUNCTION delete_orphan_raster_footprints()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_delete_orphan_raster_footprints ON raster_layer_footprints`);
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION delete_orphan_raster_footprints() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         DELETE FROM raster_footprints
         WHERE id = OLD.raster_footprint_id
           AND NOT EXISTS (
             SELECT 1 FROM raster_layer_footprints WHERE raster_footprint_id = OLD.raster_footprint_id
           );
         RETURN NULL;
       END $$`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_delete_orphan_raster_footprints
       AFTER DELETE ON raster_layer_footprints
       FOR EACH ROW EXECUTE FUNCTION delete_orphan_raster_footprints()`,
    );
  }
}
