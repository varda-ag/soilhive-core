import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDatasetLayerIndexes1773954378546 implements MigrationInterface {
  name = 'UpdateDatasetLayerIndexes1773954378546';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dataset_layers_dataset" ON "dataset_layers" USING btree ("dataset_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dataset_layers_feature" ON "dataset_layers" USING btree ("feature_id")`);
    await queryRunner.query(`ALTER TABLE "features" ALTER COLUMN "geom" SET STATISTICS 1000`);
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT IF EXISTS "FK_observations_dataset_layer_id_dataset_layers_id"`);
    await queryRunner.query(
      `ALTER TABLE "observations" ADD CONSTRAINT "FK_observations_dataset_layer_id_dataset_layers_id" FOREIGN KEY ("dataset_layer_id") REFERENCES "dataset_layers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT IF EXISTS "FK_observations_dataset_layer_id_dataset_layers_id"`);
    await queryRunner.query(
      `ALTER TABLE "observations" ADD CONSTRAINT "FK_observations_dataset_layer_id_dataset_layers_id" FOREIGN KEY ("dataset_layer_id") REFERENCES "dataset_layers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "features" ALTER COLUMN "geom" SET STATISTICS DEFAULT`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dataset_layers_feature"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dataset_layers_dataset"`);
  }
}
