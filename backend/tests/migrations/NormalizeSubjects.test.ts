import { describe, it, expect } from '@jest/globals';
import { NormalizeSubjects1793112560000 } from '../../src/migrations/1793112560000-NormalizeSubjects';
import { getDataSource } from '../../src/utils/data-source';
import { addDataset } from '../../src/utils/mock';

const query = async (sql: string, params: unknown[] = []): Promise<any[]> => (await getDataSource()).query(sql, params);

const runMigration = async (): Promise<void> => {
  const queryRunner = (await getDataSource()).createQueryRunner();
  try {
    await new NormalizeSubjects1793112560000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }
};

const entitlementsOf = async (id: string): Promise<unknown> => (await query(`SELECT data FROM entitlements WHERE id = $1`, [id]))[0]?.data;

describe('NormalizeSubjects migration', () => {
  it('merges entitlements rows that differ only in case, and leaves Subjects without @ alone', async () => {
    await query(
      `INSERT INTO entitlements (id, data) VALUES
        ('Jane.Doe@Example.com', '{"datasets": {"a": ["preview"]}, "configs": {"c": ["read"]}}'),
        ('jane.doe@example.com', '{"datasets": {"a": ["download"], "b": ["preview"]}}'),
        (' Solo@Example.com', '{"datasets": {}}'),
        ('Opaque-Sub', '{"datasets": {"a": ["preview"]}}')`,
    );

    await runMigration();

    expect(await entitlementsOf('jane.doe@example.com')).toEqual({
      datasets: { a: ['download', 'preview'], b: ['preview'] },
      configs: { c: ['read'] },
    });
    expect(await entitlementsOf('solo@example.com')).toEqual({ datasets: {} });
    expect(await entitlementsOf('Opaque-Sub')).toEqual({ datasets: { a: ['preview'] } });
    expect(await query(`SELECT id FROM entitlements WHERE id IN ('Jane.Doe@Example.com', ' Solo@Example.com')`)).toEqual([]);
  });

  it('merges past grants that are not lists, and leaves a row with nothing to merge as it was', async () => {
    await query(
      `INSERT INTO entitlements (id, data) VALUES
        ('Mal@Example.com', '{"datasets": {"a": "preview", "b": null, "c": ["download"]}, "configs": "oops"}'),
        ('mal@example.com', '{"datasets": {"c": ["preview"], "d": {}}, "configs": null}'),
        ('Lone@Example.com', '{"datasets": {"a": "preview", "b": ["download"]}}')`,
    );

    await runMigration();

    // Neither reader in EntitlementService uses these values, so leaving them out grants no less
    expect(await entitlementsOf('mal@example.com')).toEqual({ datasets: { c: ['download', 'preview'] } });
    expect(await entitlementsOf('lone@example.com')).toEqual({ datasets: { a: 'preview', b: ['download'] } });
  });

  it('keeps the older of two pending Access Requests on one Dataset and withdraws the newer', async () => {
    const dataset = await addDataset('normalize-subjects-ar', [0, 0, 1, 1]);
    const [older] = await query(
      `INSERT INTO access_requests (requested_by, capabilities, created_at) VALUES ('Jane@Example.com', '["preview"]', now() - interval '1 day') RETURNING id`,
    );
    const [newer] = await query(
      `INSERT INTO access_requests (requested_by, capabilities) VALUES ('jane@example.com', '["preview"]') RETURNING id`,
    );
    await query(
      `INSERT INTO access_request_items (request_id, dataset_id, requested_by, status, decided_by) VALUES
        ($1, $3, 'Jane@Example.com', 'pending', NULL),
        ($2, $3, 'jane@example.com', 'pending', NULL)`,
      [older.id, newer.id, dataset.id],
    );

    await runMigration();

    const items = await query(`SELECT request_id, requested_by, status FROM access_request_items WHERE dataset_id = $1`, [dataset.id]);
    expect(items).toEqual(
      expect.arrayContaining([
        { request_id: older.id, requested_by: 'jane@example.com', status: 'pending' },
        { request_id: newer.id, requested_by: 'jane@example.com', status: 'withdrawn' },
      ]),
    );
    const requests = await query(`SELECT requested_by FROM access_requests WHERE id = ANY($1::uuid[])`, [[older.id, newer.id]]);
    expect(requests.map(row => row.requested_by)).toEqual(['jane@example.com', 'jane@example.com']);
  });

  it('keeps one redemption of an Invite redeemed under two spellings, and normalizes the Invite', async () => {
    const [invite] = await query(
      `INSERT INTO invites (token_hash, grants, recipient, expires_at, created_by, created_by_privileged)
       VALUES ('normalize-subjects-hash', '{}', 'Jane@Example.com', now() + interval '1 day', 'Owner@Example.com', false) RETURNING id`,
    );
    await query(
      `INSERT INTO invite_redemptions (invite_id, subject, redeemed_at) VALUES
        ($1, 'Jane@Example.com', now() - interval '1 hour'),
        ($1, 'jane@example.com', now())`,
      [invite.id],
    );

    await runMigration();

    expect(await query(`SELECT subject FROM invite_redemptions WHERE invite_id = $1`, [invite.id])).toEqual([
      { subject: 'jane@example.com' },
    ]);
    expect(await query(`SELECT recipient, created_by FROM invites WHERE id = $1`, [invite.id])).toEqual([
      { recipient: 'jane@example.com', created_by: 'owner@example.com' },
    ]);
  });

  it('rewrites history columns, and leaves data_filters.owner alone', async () => {
    const dataset = await addDataset('normalize-subjects-history', [0, 0, 1, 1]);
    await query(`UPDATE datasets SET created_by = 'Admin@Example.com', updated_by = 'Opaque-Sub' WHERE id = $1`, [dataset.id]);
    const [filter] = await query(`INSERT INTO data_filters (filter, owner) VALUES ('{}', 'Okta.User@Example.com') RETURNING id`);

    await runMigration();

    expect(await query(`SELECT created_by, updated_by FROM datasets WHERE id = $1`, [dataset.id])).toEqual([
      { created_by: 'admin@example.com', updated_by: 'Opaque-Sub' },
    ]);
    expect(await query(`SELECT owner FROM data_filters WHERE id = $1`, [filter.id])).toEqual([{ owner: 'Okta.User@Example.com' }]);
  });
});
