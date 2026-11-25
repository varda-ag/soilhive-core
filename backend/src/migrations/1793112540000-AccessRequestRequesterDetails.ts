import { MigrationInterface, QueryRunner } from 'typeorm';

/** What a requester says about themselves on an Access Request. Null on requests made before. */
export class AccessRequestRequesterDetails1793112540000 implements MigrationInterface {
  name = 'AccessRequestRequesterDetails1793112540000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "access_requests" ADD "requester_name" text, ADD "country" text, ADD "organisation" text, ADD "organisation_website" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "access_requests" DROP COLUMN "organisation_website", DROP COLUMN "organisation", DROP COLUMN "country", DROP COLUMN "requester_name"`,
    );
  }
}
