import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1770647077828 implements MigrationInterface {
  name = 'CreateSchema1770647077828';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE dataset_file_mappings ALTER COLUMN data_mapping_id DROP NOT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE dataset_file_mappings ALTER COLUMN data_mapping_id SET NOT NULL;`);
  }
}
