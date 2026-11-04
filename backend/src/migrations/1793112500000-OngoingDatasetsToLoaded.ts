import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loads no longer move a Dataset to ONGOING (docs/backend/dataset-version-plan.md, phase 2), so a
 * Dataset still ONGOING was left there by a worker that died mid-load. It becomes LOADED, the status
 * a retry gave it before. Not reversible: which Datasets were ONGOING is not kept.
 */
export class OngoingDatasetsToLoaded1793112500000 implements MigrationInterface {
  name = 'OngoingDatasetsToLoaded1793112500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "datasets" SET "status" = 'LOADED', "updated_at" = now() WHERE "status" = 'ONGOING'`);
  }

  public async down(): Promise<void> {
    // Nothing to restore
  }
}
