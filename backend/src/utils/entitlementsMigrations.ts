import { QueryRunner } from 'typeorm';

// Ids are spelled out literally here, not imported from constants.ts — a migration must stay
// self-contained and reproduce the exact historical statement even if the app constants change.
const SYSTEM_CONFIG_IDS = ['frontend-logo', 'theme', 'ingestion-status', 'vocabulary-csv-hashes'] as const;

/**
 * Grants EVERYONE `read` on the four known system config ids, so GET /config/{configId} on them
 * keeps working anonymously now that it's entitlements-gated (see ADR-0037).
 *
 * A live 'everyone' row may already exist (e.g. a dataset grant made via the API), so this
 * merges into data->'configs' rather than overwriting the row: `||` only replaces the 4 named
 * keys within 'configs', leaving 'datasets' and any other 'configs' entries untouched.
 *
 * Lives outside `src/migrations/` on purpose: TypeORM's migration glob loader treats every export
 * of a file under that directory as a migration class and tries to instantiate it, so a plain
 * helper function exported alongside a migration class breaks loading of every migration.
 */
export const grantEveryoneSystemConfigReads = async (queryRunner: QueryRunner): Promise<void> => {
  const grants = SYSTEM_CONFIG_IDS.map(id => `'${id}', '["read"]'::jsonb`).join(',\n        ');
  await queryRunner.query(`
    INSERT INTO "entitlements" ("id", "data")
    VALUES ('everyone', jsonb_build_object('configs', jsonb_build_object(${grants})))
    ON CONFLICT ("id") DO UPDATE SET "data" = jsonb_set(
      "entitlements"."data",
      '{configs}',
      COALESCE("entitlements"."data"->'configs', '{}'::jsonb) || jsonb_build_object(${grants})
    )
  `);
};

/**
 * Strips exactly the 4 keys `grantEveryoneSystemConfigReads` granted from EVERYONE's
 * data->'configs', not the whole row — any other grant EVERYONE has (datasets, or other
 * configs) must survive.
 */
export const revokeEveryoneSystemConfigReads = async (queryRunner: QueryRunner): Promise<void> => {
  const idsArray = SYSTEM_CONFIG_IDS.map(id => `'${id}'`).join(', ');
  await queryRunner.query(`
    UPDATE "entitlements"
    SET "data" = jsonb_set("data", '{configs}', COALESCE("data"->'configs', '{}'::jsonb) - ARRAY[${idsArray}]::text[])
    WHERE "id" = 'everyone'
  `);
};
