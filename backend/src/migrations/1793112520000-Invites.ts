import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Invites: Entitlements held back until redeemed (docs/adr/0081, 0082). Withdrawing one sets
 * `deleted_at`; redemptions are kept apart so a reusable Invite records each person once.
 */
export class Invites1793112520000 implements MigrationInterface {
  name = 'Invites1793112520000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invites" (
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "token_hash" text NOT NULL,
        "grants" jsonb NOT NULL,
        "recipient" text,
        "reusable" boolean NOT NULL DEFAULT false,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_by" text NOT NULL,
        "created_by_privileged" boolean NOT NULL,
        CONSTRAINT "PK_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invites_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "CHK_invites_recipient_not_reusable" CHECK ("recipient" IS NULL OR NOT "reusable")
      )`,
    );
    // Listing by config item or Dataset, and the cleanup on a Purge or a config item delete
    await queryRunner.query(`CREATE INDEX "IDX_invites_grants_configs" ON "invites" USING GIN (("grants"->'configs'))`);
    await queryRunner.query(`CREATE INDEX "IDX_invites_grants_datasets" ON "invites" USING GIN (("grants"->'datasets'))`);
    await queryRunner.query(
      `CREATE TABLE "invite_redemptions" (
        "invite_id" uuid NOT NULL,
        "subject" text NOT NULL,
        "redeemed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invite_redemptions_invite_id_subject" PRIMARY KEY ("invite_id", "subject"),
        CONSTRAINT "FK_invite_redemptions_invite_id_invites_id" FOREIGN KEY ("invite_id") REFERENCES "invites"("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invite_redemptions"`);
    await queryRunner.query(`DROP TABLE "invites"`);
  }
}
