import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddingMetadataToFiles1770807605470 implements MigrationInterface {
  name = 'AddingMetadataToFiles1770807605470';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE files ADD metadata jsonb`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN file_path DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN status DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN file_path DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE soil_properties DROP CONSTRAINT "CHK_188f69807f9e9e83f7220b272b"`);
    await queryRunner.query(
      `ALTER TABLE soil_properties ADD CONSTRAINT CHK_e77399e8e3090fe38abe5c160c CHECK (((property_level >= 1) AND (property_level <= 2)))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`ALTER TABLE soil_properties DROP CONSTRAINT "CHK_e77399e8e3090fe38abe5c160c"`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN status SET DEFAULT 'PENDING'`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN status SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE files ALTER COLUMN file_path SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE files DROP COLUMN metadata`);
    await queryRunner.query(
      `ALTER TABLE soil_properties ADD CONSTRAINT CHK_188f69807f9e9e83f7220b272b CHECK (((property_level >= 1) AND (property_level <= 5)))`,
    );
  }
}
