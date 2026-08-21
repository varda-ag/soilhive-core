import { MigrationInterface, QueryRunner } from 'typeorm';

export class SlugHistoryIndex1787304504424 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IDX_slug_history_slug ON slug_history (slug)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IDX_slug_history_slug`);
  }
}
