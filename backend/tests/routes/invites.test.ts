import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { app } from '../../src/app';
import DatasetEntity from '../../src/entities/Dataset';
import { RequestData } from '../../src/interfaces/RequestData';
import InviteService from '../../src/services/InviteService';
import { EntitlementScope } from '../../src/types/Entitlements';
import { TOKEN_ISSUER } from '../../src/types/enums';
import { getEntityManager } from '../../src/utils/data-source';
import { addDataset } from '../../src/utils/mock';
import { signPasswordGrantToken } from '../../src/utils/password-grant-key';
import { resetUserinfoEndpoint } from '../../src/utils/userinfo';
import { getSuperAdminToken, getUserToken } from '../helper';

const CONFIG_ID = 'plugin:dashboards:dashboards:1';
const OWNER = 'owner@example.com';
const JANE = 'jane@example.com';
const OTHER = 'other@example.com';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const grantsOf = async (subject: string) => {
  const manager = await getEntityManager();
  const [row] = await manager.query(`SELECT data FROM entitlements WHERE id = $1`, [subject]);
  return row?.data;
};

describe('Invites', () => {
  let adminToken: string;
  let ownerToken: string;
  let janeToken: string;
  let otherToken: string;

  beforeAll(async () => {
    adminToken = await getSuperAdminToken();
  });

  beforeEach(async () => {
    ownerToken = getUserToken('owner-sub', OWNER);
    janeToken = getUserToken('jane-sub', JANE);
    otherToken = getUserToken('other-sub', OTHER);
    // First access: the owner's save claims the config item and self-grants write
    await request(app).put(`/configs/${CONFIG_ID}`).set(auth(ownerToken)).send({ title: 'Dashboard' }).expect(StatusCodes.OK);
  });

  const createInvite = (token: string, body: object) => request(app).post('/invites').set(auth(token)).send(body);
  const redeem = (token: string, inviteToken: string) => request(app).post('/invites/redeem').set(auth(token)).send({ token: inviteToken });
  const readInvite = { grants: { configs: { [CONFIG_ID]: ['read'] } } };

  describe('POST /invites', () => {
    it('lets a write holder invite to their config item, returning the token once', async () => {
      const res = await createInvite(ownerToken, readInvite);

      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({ grants: readInvite.grants, recipient: null, reusable: false, status: 'pending', created_by: OWNER });
      expect(res.body.token).toEqual(expect.any(String));
      const days = (Date.parse(res.body.expires_at) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);
      const manager = await getEntityManager();
      const [row] = await manager.query(`SELECT token_hash FROM invites WHERE id = $1`, [res.body.id]);
      expect(row.token_hash).not.toBe(res.body.token);
    });

    it('refuses a caller without write on the config item', async () => {
      expect((await createInvite(janeToken, readInvite)).statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('answers 404 for a config item that does not exist', async () => {
      const res = await createInvite(ownerToken, { grants: { configs: { 'plugin:dashboards:dashboards:none': ['read'] } } });
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('lets only an admin invite to a Dataset', async () => {
      const dataset = await addDataset('Private one', [0, 0, 1, 1]);
      const body = { grants: { datasets: { [dataset.slug]: ['download', 'preview'] } } };

      expect((await createInvite(ownerToken, body)).statusCode).toBe(StatusCodes.FORBIDDEN);
      const res = await createInvite(adminToken, body);
      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body.grants).toEqual({ datasets: { [dataset.slug]: ['download', 'preview'] } });
    });

    it('answers 404 for a Dataset that does not exist', async () => {
      const res = await createInvite(adminToken, { grants: { datasets: { 'no-such-dataset': ['preview'] } } });
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it.each([
      ['a capability of the other scope', { grants: { configs: { [CONFIG_ID]: ['download'] } } }],
      ['no grants', { grants: {} }],
      ['a reusable Invite with a recipient', { ...readInvite, recipient: JANE, reusable: true }],
      ['an expiry past 30 days', { ...readInvite, expires_in_days: 31 }],
    ])('refuses %s', async (_label, body) => {
      expect((await createInvite(ownerToken, body)).statusCode).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /invites/redeem', () => {
    it('grants a single-use Invite once, and again to the same person only', async () => {
      const { token } = (await createInvite(ownerToken, readInvite)).body;

      const res = await redeem(janeToken, token);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.grants).toEqual(readInvite.grants);
      expect((await grantsOf(JANE)).configs).toEqual({ [CONFIG_ID]: ['read'] });

      expect((await redeem(janeToken, token)).statusCode).toBe(StatusCodes.OK);
      expect((await redeem(otherToken, token)).statusCode).toBe(StatusCodes.GONE);
      expect(await grantsOf(OTHER)).toBeUndefined();
    });

    it('grants a reusable Invite to everyone who redeems it and records each', async () => {
      const { token, id } = (await createInvite(ownerToken, { ...readInvite, reusable: true })).body;

      await redeem(janeToken, token).expect(StatusCodes.OK);
      await redeem(otherToken, token).expect(StatusCodes.OK);

      expect((await grantsOf(OTHER)).configs).toEqual({ [CONFIG_ID]: ['read'] });
      const list = await request(app).get('/invites').query({ config_id: CONFIG_ID }).set(auth(ownerToken)).expect(StatusCodes.OK);
      const invite = list.body.find((item: { id: string }) => item.id === id);
      expect(invite.status).toBe('pending');
      expect(invite.redemptions.map((r: { subject: string }) => r.subject)).toEqual([JANE, OTHER]);
    });

    it('keeps what the redeemer already holds', async () => {
      const { token } = (await createInvite(ownerToken, readInvite)).body;
      await redeem(ownerToken, token).expect(StatusCodes.OK);
      expect((await grantsOf(OWNER)).configs).toEqual({ [CONFIG_ID]: ['read', 'write'] });
    });

    it('answers 410 once the Invite has expired', async () => {
      const { token, id } = (await createInvite(ownerToken, readInvite)).body;
      const manager = await getEntityManager();
      await manager.query(`UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
      expect((await redeem(janeToken, token)).statusCode).toBe(StatusCodes.GONE);
    });

    it('answers 404 for an unknown or withdrawn Invite', async () => {
      const { token, id } = (await createInvite(ownerToken, readInvite)).body;
      await request(app).delete(`/invites/${id}`).set(auth(ownerToken)).expect(StatusCodes.NO_CONTENT);

      expect((await redeem(janeToken, token)).statusCode).toBe(StatusCodes.NOT_FOUND);
      expect((await redeem(janeToken, 'not-a-token')).statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('lets only the recipient redeem, ignoring case, and leaves it pending for anyone else', async () => {
      const { token } = (await createInvite(ownerToken, { ...readInvite, recipient: 'Jane@Example.com' })).body;

      const refused = await redeem(otherToken, token);
      expect(refused.statusCode).toBe(StatusCodes.FORBIDDEN);
      expect(refused.body.recipient_hint).toBe('J•••@Example.com');
      expect(refused.body.detail).not.toContain('Jane@');

      await redeem(janeToken, token).expect(StatusCodes.OK);
      // Keyed by Jane's Subject as her token spells it, not by the email the Invite names
      expect((await grantsOf(JANE)).configs).toEqual({ [CONFIG_ID]: ['read'] });
    });

    it('stops working while its non-admin creator no longer holds write, and stays pending', async () => {
      const { token } = (await createInvite(ownerToken, readInvite)).body;
      const manager = await getEntityManager();
      await manager.query(`UPDATE entitlements SET data = jsonb_set(data, '{configs}', '{}'::jsonb) WHERE id = $1`, [OWNER]);

      expect((await redeem(janeToken, token)).statusCode).toBe(StatusCodes.FORBIDDEN);

      await manager.query(`UPDATE entitlements SET data = jsonb_set(data, '{configs}', $2::jsonb) WHERE id = $1`, [
        OWNER,
        JSON.stringify({ [CONFIG_ID]: ['write'] }),
      ]);
      await redeem(janeToken, token).expect(StatusCodes.OK);
    });

    it("does not check an admin creator's config grants again", async () => {
      const { token } = (await createInvite(adminToken, readInvite)).body;
      await redeem(janeToken, token).expect(StatusCodes.OK);
    });

    describe('a recipient on a deployment whose access tokens carry no email', () => {
      const authority = 'https://idp.example/realms/soilhive';
      let tokenWithoutEmail: string;
      let fetchSpy: jest.SpiedFunction<typeof fetch>;

      beforeEach(() => {
        tokenWithoutEmail = signPasswordGrantToken({ sub: 'jane-sub', scope: 'user', iss: TOKEN_ISSUER }, 3600);
        process.env.OIDC_AUTHORITY = authority;
        resetUserinfoEndpoint();
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
          const url = String(input);
          if (url === `${authority}/.well-known/openid-configuration`) {
            return { ok: true, json: async () => ({ userinfo_endpoint: `${authority}/userinfo` }) } as Response;
          }
          return { ok: true, json: async () => ({ sub: 'jane-sub', email: JANE }) } as Response;
        });
      });

      afterEach(() => {
        delete process.env.OIDC_AUTHORITY;
        fetchSpy.mockRestore();
      });

      it("matches the identity provider's email and grants to the person's sub", async () => {
        const { token } = (await createInvite(ownerToken, { ...readInvite, recipient: JANE })).body;

        await redeem(tokenWithoutEmail, token).expect(StatusCodes.OK);

        expect((await grantsOf('jane-sub')).configs).toEqual({ [CONFIG_ID]: ['read'] });
        expect(await grantsOf(JANE)).toBeUndefined();
      });
    });
  });

  describe('GET /invites', () => {
    it("shows a config item's Invites to its write holders, with who redeemed them", async () => {
      const { token, id } = (await createInvite(ownerToken, readInvite)).body;
      await redeem(janeToken, token).expect(StatusCodes.OK);

      const res = await request(app).get('/invites').query({ config_id: CONFIG_ID }).set(auth(ownerToken));
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id, status: 'used', redemptions: [{ subject: JANE }] });
      expect(res.body[0].token).toBeUndefined();
    });

    it('refuses a caller without write, and a non-admin listing without a config item', async () => {
      await createInvite(ownerToken, readInvite).expect(StatusCodes.CREATED);
      expect((await request(app).get('/invites').query({ config_id: CONFIG_ID }).set(auth(janeToken))).statusCode).toBe(
        StatusCodes.FORBIDDEN,
      );
      expect((await request(app).get('/invites').set(auth(ownerToken))).statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('hides an Invite holding a Dataset from a non-admin, and lists by Dataset for an admin', async () => {
      const dataset = await addDataset('Private two', [0, 0, 1, 1]);
      const grants = { configs: { [CONFIG_ID]: ['read'] }, datasets: { [dataset.slug]: ['preview'] } };
      const { id } = (await createInvite(adminToken, { grants })).body;

      const ownerView = await request(app).get('/invites').query({ config_id: CONFIG_ID }).set(auth(ownerToken)).expect(StatusCodes.OK);
      expect(ownerView.body).toEqual([]);
      const adminView = await request(app).get('/invites').query({ dataset_id: dataset.slug }).set(auth(adminToken)).expect(StatusCodes.OK);
      expect(adminView.body.map((invite: { id: string }) => invite.id)).toEqual([id]);
    });
  });

  describe('DELETE /invites/{inviteId}', () => {
    it('answers 404 to someone who could not have created it', async () => {
      const { id } = (await createInvite(ownerToken, readInvite)).body;
      expect((await request(app).delete(`/invites/${id}`).set(auth(janeToken))).statusCode).toBe(StatusCodes.NOT_FOUND);
      await request(app).delete(`/invites/${id}`).set(auth(ownerToken)).expect(StatusCodes.NO_CONTENT);
    });
  });

  describe('what happens to pending Invites when their target goes away', () => {
    // Deleting a plugin config item needs pg-boss, so that case is in data-requests.test.ts
    it('drops a purged Dataset and keeps the rest of the Invite', async () => {
      const dataset = await addDataset('Private three', [0, 0, 1, 1]);
      const { id } = (
        await createInvite(adminToken, { grants: { configs: { [CONFIG_ID]: ['read'] }, datasets: { [dataset.slug]: ['preview'] } } })
      ).body;
      const manager = await getEntityManager();

      await new InviteService().dropFromPendingInvites(
        { entityManager: manager, entitlements: {} } as RequestData,
        EntitlementScope.DATASETS,
        dataset.slug,
      );

      const [row] = await manager.query(`SELECT grants, deleted_at FROM invites WHERE id = $1`, [id]);
      expect(row.grants).toEqual({ configs: { [CONFIG_ID]: ['read'] }, datasets: {} });
      expect(row.deleted_at).toBeNull();
    });

    it('leaves a used-up Invite as history', async () => {
      const dataset = await addDataset('Private four', [0, 0, 1, 1]);
      await (await getEntityManager()).getRepository(DatasetEntity).update({ id: dataset.id }, { visibility: 'private' });
      const { token, id } = (await createInvite(adminToken, { grants: { datasets: { [dataset.slug]: ['preview'] } } })).body;
      await redeem(janeToken, token).expect(StatusCodes.OK);
      const manager = await getEntityManager();

      await new InviteService().dropFromPendingInvites(
        { entityManager: manager, entitlements: {} } as RequestData,
        EntitlementScope.DATASETS,
        dataset.slug,
      );

      const [row] = await manager.query(`SELECT grants FROM invites WHERE id = $1`, [id]);
      expect(row.grants).toEqual({ datasets: { [dataset.slug]: ['preview'] } });
    });
  });
});
