import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loads no longer move a Dataset to ONGOING (statusAfterLoad), so a Dataset still ONGOING was left
 * there by a worker that died mid-load. What it becomes depends on what that load left behind:
 * - LOADED when it has loaded data, Dataset Layers or live Raster Layers: the status a retry gave it
 *   before. A PUBLISHED Dataset hidden by the load is among these, and needs publishing again by hand.
 * - PENDING when it has none: the load was its first and wrote nothing, so it has nothing to review
 *   and goes back through the steps.
 *
 * Not reversible: which Datasets were ONGOING is not kept.
 */
export class OngoingDatasetsToLoaded1793112500000 implements MigrationInterface {
  name = 'OngoingDatasetsToLoaded1793112500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "datasets" ds
       SET "status" = CASE
             WHEN EXISTS (SELECT 1 FROM "dataset_layers" dl WHERE dl."dataset_id" = ds."id")
               OR EXISTS (SELECT 1 FROM "raster_layers" rl WHERE rl."dataset_id" = ds."id" AND rl."deleted_at" IS NULL)
             THEN 'LOADED'
             ELSE 'PENDING'
           END,
           "updated_at" = now()
       WHERE ds."status" = 'ONGOING'`,
    );
  }

  public async down(): Promise<void> {
    // Nothing to restore
  }
}
