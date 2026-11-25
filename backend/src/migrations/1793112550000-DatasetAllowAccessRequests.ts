import { MigrationInterface, QueryRunner } from 'typeorm';

/** Whether a Dataset takes new Access Requests, off until an admin turns it on. */
export class DatasetAllowAccessRequests1793112550000 implements MigrationInterface {
  name = 'DatasetAllowAccessRequests1793112550000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" ADD "allow_access_requests" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "datasets" DROP COLUMN "allow_access_requests"`);
  }
}
