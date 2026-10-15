import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The slug unique constraints these entities declare (@Unique(['slug'])) but CreateSchema never
 * created. The slug triggers already keep slugs unique against slug_history, but nothing enforced
 * it: two concurrent inserts can pass the same check.
 *
 * On licenses it also lets the planner drop the `license_fallback` join (on licenses.slug) where
 * nothing reads it. That needs a unique index over every row, so these are not partial on
 * deleted_at; the triggers never reuse a soft-deleted row's slug either.
 *
 * Duplicates are reported, not repaired: slugs are references (datasets.licenses holds licence
 * slugs, entitlements dataset slugs), so which row keeps one is a decision for a person.
 */
const TABLES = ['datasets', 'files', 'licenses', 'soil_properties', 'soil_property_categories', 'unit_conversions'];

export class UniqueSlugs1791936100000 implements MigrationInterface {
  name = 'UniqueSlugs1791936100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: string[] = [];
    for (const table of TABLES) {
      const rows: { slug: string; ids: string[] }[] = await queryRunner.query(
        `SELECT slug, array_agg(id::text ORDER BY id) AS ids FROM "${table}" GROUP BY slug HAVING count(*) > 1`,
      );
      duplicates.push(...rows.map(row => `${table}.slug "${row.slug}": ${row.ids.join(', ')}`));
    }
    if (duplicates.length > 0) {
      throw new Error(`Cannot add slug unique constraints, duplicate slugs found:\n${duplicates.join('\n')}`);
    }

    for (const table of TABLES) {
      await queryRunner.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
             WHERE con.conname = 'UQ_${table}_slug' AND nsp.nspname = current_schema()
           ) THEN
             ALTER TABLE "${table}" ADD CONSTRAINT "UQ_${table}_slug" UNIQUE ("slug");
           END IF;
         END $$`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "UQ_${table}_slug"`);
    }
  }
}
