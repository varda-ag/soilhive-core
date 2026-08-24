import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicationDateFormat1787577738964 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" ALTER COLUMN "publication_date" TYPE text USING publication_date::text`);
    await queryRunner.query(
      `ALTER TABLE "datasets" ADD CONSTRAINT chk_date_format_publication CHECK ("publication_date" ~ '^\\d{4}$' OR "publication_date" ~ '^\\d{4}-\\d{2}$' OR "publication_date" ~ '^\\d{4}-\\d{2}-\\d{2}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" DROP CONSTRAINT chk_date_format_publication`);
    await queryRunner.query(`ALTER TABLE "datasets" ALTER COLUMN "publication_date" TYPE date USING publication_date::date`);
  }
}
