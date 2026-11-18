import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Access Requests (docs/adr/0082): a Subject asks for access to Datasets, decided one Dataset at a
 * time. Items reference Datasets by id, which survives renames; a Purge keeps the Dataset row.
 */
export class AccessRequests1793112530000 implements MigrationInterface {
  name = 'AccessRequests1793112530000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "access_requests" (
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "requested_by" text NOT NULL,
        "capabilities" jsonb NOT NULL,
        "message" text,
        CONSTRAINT "PK_access_requests_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_access_requests_requested_by" ON "access_requests" ("requested_by")`);
    await queryRunner.query(
      `CREATE TABLE "access_request_items" (
        "request_id" uuid NOT NULL,
        "dataset_id" uuid NOT NULL,
        "requested_by" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "granted" jsonb,
        "reason" text,
        "decided_by" text,
        "decided_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_access_request_items_request_id_dataset_id" PRIMARY KEY ("request_id", "dataset_id"),
        CONSTRAINT "CHK_access_request_items_status" CHECK ("status" IN ('pending', 'approved', 'denied', 'withdrawn')),
        CONSTRAINT "FK_access_request_items_request_id_access_requests_id" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_access_request_items_dataset_id_datasets_id" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE
      )`,
    );
    // One pending request per Subject per Dataset
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_access_request_items_requested_by_dataset_id_pending" ON "access_request_items" ("requested_by", "dataset_id") WHERE "status" = 'pending'`,
    );
    // The admin queue, and the cascade and cleanup by Dataset
    await queryRunner.query(
      `CREATE INDEX "IDX_access_request_items_pending" ON "access_request_items" ("request_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_access_request_items_dataset_id" ON "access_request_items" ("dataset_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "access_request_items"`);
    await queryRunner.query(`DROP TABLE "access_requests"`);
  }
}
