import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Version Datasets (docs/backend/dataset-version-plan.md, phase 3): data added to a PUBLISHED Dataset
 * (v1) goes into a Dataset row of its own (v2) with `version_of = v1`, hidden by its status until it
 * is published into v1. Every existing Dataset is version 1.
 *
 * `data_updated_at` records when a Dataset's published data last changed, apart from `updated_at`,
 * which any metadata edit moves. A PUBLISHED Dataset is backfilled with the latest `updated_at` of
 * its LOADED Files, the closest record of its last load; any other Dataset starts null.
 *
 * What references a Dataset, which publishing and discarding a version have to handle:
 * - by id, with a foreign key:
 *   - dataset_file_mappings.dataset_id (NO ACTION)
 *   - dataset_layers.dataset_id (NO ACTION); observations go with their dataset_layers (CASCADE)
 *   - raster_layers.dataset_id (CASCADE, deferred); assets, footprint links and group members go with them
 *   - datasets.version_of (NO ACTION, added here)
 * - datasets (id, slug) → slug_history (entity_id, slug), deferred
 * - by slug, without a foreign key: entitlements (jsonb keys), and pg-boss job data (data->>'dataset_id')
 */
export class DatasetVersions1793112510000 implements MigrationInterface {
  name = 'DatasetVersions1793112510000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" ADD "version_of" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "datasets" ADD "version_number" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(
      `ALTER TABLE "datasets" ADD CONSTRAINT "FK_datasets_version_of_datasets_id" FOREIGN KEY ("version_of") REFERENCES "datasets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    // One open version per Dataset
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_datasets_version_of_open" ON "datasets" ("version_of") WHERE "version_of" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    // A version is never public: it goes live by being published into the Dataset it is a version of
    await queryRunner.query(
      `ALTER TABLE "datasets" ADD CONSTRAINT "CHK_datasets_version_not_published" CHECK ("version_of" IS NULL OR "status" <> 'PUBLISHED')`,
    );
    // The same type as updated_at, which the metadata page shows next to it, and as files.updated_at it's backfilled from
    await queryRunner.query(`ALTER TABLE "datasets" ADD "data_updated_at" TIMESTAMP NULL`);
    await queryRunner.query(
      `UPDATE "datasets" ds
       SET "data_updated_at" = loaded.last_loaded
       FROM (
         SELECT dfm.dataset_id, max(f.updated_at) AS last_loaded
         FROM "dataset_file_mappings" dfm
         JOIN "files" f ON f.id = dfm.file_id
         WHERE dfm.deleted_at IS NULL AND f.deleted_at IS NULL AND f.status = 'LOADED'
         GROUP BY dfm.dataset_id
       ) loaded
       WHERE ds.id = loaded.dataset_id AND ds.status = 'PUBLISHED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN "data_updated_at"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP CONSTRAINT "CHK_datasets_version_not_published"`);
    await queryRunner.query(`DROP INDEX "IDX_datasets_version_of_open"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP CONSTRAINT "FK_datasets_version_of_datasets_id"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN "version_number"`);
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN "version_of"`);
  }
}
