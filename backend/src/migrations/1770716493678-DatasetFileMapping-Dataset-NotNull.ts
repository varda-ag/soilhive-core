import { MigrationInterface, QueryRunner } from 'typeorm';

export class DatasetFileMappingDatasetNotNull1770716493678 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE dataset_file_mappings ALTER COLUMN dataset_id SET NOT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE dataset_file_mappings ALTER COLUMN dataset_id DROP NOT NULL;`);
  }
}
