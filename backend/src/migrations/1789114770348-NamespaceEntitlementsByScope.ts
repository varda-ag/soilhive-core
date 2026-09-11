import { MigrationInterface, QueryRunner } from 'typeorm';

export class NamespaceEntitlementsByScope1789114770348 implements MigrationInterface {
  name = 'NamespaceEntitlementsByScope1789114770348';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nest every row's flat slug map under "datasets", so a future "configs" scope can share
    // the same column without colliding with dataset slugs (see ADR-0032).
    await queryRunner.query(`UPDATE "entitlements" SET "data" = jsonb_build_object('datasets', "data")`);

    // `?`/`?|` only test top-level keys of whatever expression they're applied to, so the old
    // index (on the bare column) stops matching once slugs move a level down. GIN can only use
    // an index whose expression matches the query's expression, and a query is always scoped
    // to one namespace (`data->'datasets' ?| ...` or `data->'configs' ?| ...`) — so each scope
    // needs its own expression index, not one shared index across both.
    await queryRunner.query(`DROP INDEX "idx_entitlements_data_gin"`);
    await queryRunner.query(`CREATE INDEX "idx_entitlements_data_datasets_gin" ON "entitlements" USING GIN (("data"->'datasets'))`);
    await queryRunner.query(`CREATE INDEX "idx_entitlements_data_configs_gin" ON "entitlements" USING GIN (("data"->'configs'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_entitlements_data_datasets_gin"`);
    await queryRunner.query(`DROP INDEX "idx_entitlements_data_configs_gin"`);
    await queryRunner.query(`CREATE INDEX "idx_entitlements_data_gin" ON "entitlements" USING GIN ("data")`);

    // Any "configs" data written after the deploy is not preserved on rollback — rollback is
    // only expected immediately after a bad deploy (see ADR-0032).
    await queryRunner.query(`UPDATE "entitlements" SET "data" = "data"->'datasets'`);
  }
}
