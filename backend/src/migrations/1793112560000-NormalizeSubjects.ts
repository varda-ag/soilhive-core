import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rewrites every stored Subject that contains `@` to its trimmed, lowercase form (docs/adr/0085).
 * `data_filters.owner` and pg-boss job data are left as they are, on purpose.
 */

// A copy of normalizeSubject (src/utils/auth.ts), so this migration never changes with it
const normalize = (subject: string): string => (subject.includes('@') ? subject.trim().toLowerCase() : subject);

/** Rewritten in place, once the steps before have removed every row that would collide. */
const PLAIN_COLUMNS: [table: string, column: string][] = [
  ['invites', 'created_by'],
  ['invites', 'recipient'],
  ['access_requests', 'requested_by'],
  ['access_request_items', 'requested_by'],
  ['access_request_items', 'decided_by'],
  ['invite_redemptions', 'subject'],
  ['datasets', 'created_by'],
  ['datasets', 'updated_by'],
  ['files', 'created_by'],
  ['files', 'updated_by'],
  ['data_mappings', 'created_by'],
  ['raster_filters', 'created_by'],
];

type Grants = Record<string, Record<string, string[]>>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Groups values by their normalized form, keeping only groups with something to rewrite. */
const groupsToRewrite = <T>(rows: T[], subjectOf: (row: T) => string, keyOf: (row: T) => string = () => ''): T[][] => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${keyOf(row)}\u0000${normalize(subjectOf(row))}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].filter(group => group.some(row => subjectOf(row) !== normalize(subjectOf(row))));
};

/**
 * The union of capabilities per scope and key. A scope that isn't an object, or capabilities that
 * aren't a list, are left out: EntitlementService skips them too, so they grant nothing. Spread as
 * they are, `null` would throw and a string would split into letters.
 * Null-prototype maps, as a key may be `__proto__`.
 */
const mergeGrants = (all: unknown[]): Grants => {
  const merged: Grants = Object.create(null);
  for (const data of all) {
    if (!isObject(data)) {
      continue;
    }
    for (const [scope, grants] of Object.entries(data)) {
      if (!isObject(grants)) {
        continue;
      }
      merged[scope] ??= Object.create(null);
      for (const [key, capabilities] of Object.entries(grants)) {
        if (!Array.isArray(capabilities)) {
          continue;
        }
        merged[scope]![key] = [...new Set([...(merged[scope]![key] ?? []), ...capabilities])].sort();
      }
    }
  }
  return merged;
};

export class NormalizeSubjects1793112560000 implements MigrationInterface {
  name = 'NormalizeSubjects1793112560000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.mergeEntitlements(queryRunner);
    await this.dropDuplicateRedemptions(queryRunner);
    await this.withdrawDuplicatePendingItems(queryRunner);
    for (const [table, column] of PLAIN_COLUMNS) {
      await this.rewrite(queryRunner, table, column);
    }
  }

  public async down(): Promise<void> {
    // The original spelling is gone; there is nothing to restore
  }

  /** Rows whose ids normalize alike become one row holding the union of their grants. */
  private async mergeEntitlements(queryRunner: QueryRunner): Promise<void> {
    // Timestamps as text, ordered oldest first, so they go back unchanged whatever the time zone
    const rows: { id: string; data: unknown; created_at: string; deleted_at: string | null }[] = await queryRunner.query(
      `SELECT "id", "data", "created_at"::text AS "created_at", "deleted_at"::text AS "deleted_at"
       FROM "entitlements" WHERE "id" LIKE '%@%' ORDER BY "created_at"`,
    );
    for (const group of groupsToRewrite(rows, row => row.id)) {
      const live = group.filter(row => row.deleted_at === null);
      const kept = live.length > 0 ? live : group;
      // A row with nothing to merge into keeps its data exactly as it was
      const data = kept.length === 1 ? kept[0]!.data : mergeGrants(kept.map(row => row.data));
      await queryRunner.query(`DELETE FROM "entitlements" WHERE "id" = ANY($1::text[])`, [group.map(row => row.id)]);
      await queryRunner.query(
        `INSERT INTO "entitlements" ("id", "data", "created_at", "updated_at", "deleted_at")
         VALUES ($1, $2::jsonb, $3::timestamp, now(), $4::timestamp)`,
        [normalize(group[0]!.id), JSON.stringify(data), group[0]!.created_at, live.length > 0 ? null : group[0]!.deleted_at],
      );
    }
  }

  /** The same Invite redeemed under two spellings keeps its first redemption. */
  private async dropDuplicateRedemptions(queryRunner: QueryRunner): Promise<void> {
    const rows: { invite_id: string; subject: string; redeemed_at: Date }[] = await queryRunner.query(
      `SELECT "invite_id", "subject", "redeemed_at" FROM "invite_redemptions" WHERE "subject" LIKE '%@%' ORDER BY "redeemed_at"`,
    );
    for (const group of groupsToRewrite(
      rows,
      row => row.subject,
      row => row.invite_id,
    )) {
      const extra = group.slice(1).map(row => row.subject);
      if (extra.length > 0) {
        await queryRunner.query(`DELETE FROM "invite_redemptions" WHERE "invite_id" = $1 AND "subject" = ANY($2::text[])`, [
          group[0]!.invite_id,
          extra,
        ]);
      }
    }
  }

  /** Of two pending requests on one Dataset under two spellings, the older stays pending. */
  private async withdrawDuplicatePendingItems(queryRunner: QueryRunner): Promise<void> {
    const rows: { request_id: string; dataset_id: string; requested_by: string }[] = await queryRunner.query(
      `SELECT i."request_id", i."dataset_id", i."requested_by"
       FROM "access_request_items" i JOIN "access_requests" r ON r."id" = i."request_id"
       WHERE i."status" = 'pending' AND i."requested_by" LIKE '%@%'
       ORDER BY r."created_at", r."id"`,
    );
    for (const group of groupsToRewrite(
      rows,
      row => row.requested_by,
      row => row.dataset_id,
    )) {
      for (const row of group.slice(1)) {
        await queryRunner.query(`UPDATE "access_request_items" SET "status" = 'withdrawn' WHERE "request_id" = $1 AND "dataset_id" = $2`, [
          row.request_id,
          row.dataset_id,
        ]);
      }
    }
  }

  private async rewrite(queryRunner: QueryRunner, table: string, column: string): Promise<void> {
    const rows: { value: string }[] = await queryRunner.query(
      `SELECT DISTINCT "${column}" AS "value" FROM "${table}" WHERE "${column}" LIKE '%@%'`,
    );
    const changed = rows.filter(({ value }) => value !== normalize(value));
    if (changed.length === 0) {
      return;
    }
    await queryRunner.query(
      `UPDATE "${table}" SET "${column}" = m."new" FROM unnest($1::text[], $2::text[]) AS m("old", "new") WHERE "${table}"."${column}" = m."old"`,
      [changed.map(({ value }) => value), changed.map(({ value }) => normalize(value))],
    );
  }
}
