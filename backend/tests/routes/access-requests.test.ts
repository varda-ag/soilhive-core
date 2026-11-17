import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { app } from '../../src/app';
import { THEME_CONFIG_ID } from '../../src/constants/constants';
import DatasetEntity from '../../src/entities/Dataset';
import { JsonStorage } from '../../src/entities/JsonStorage';
import { RequestData } from '../../src/interfaces/RequestData';
import AccessRequestService from '../../src/services/AccessRequestService';
import { getEntityManager } from '../../src/utils/data-source';
import { addDataset } from '../../src/utils/mock';
import { getMachineToken, getSuperAdminToken, getUserToken, getUserTokenWithoutEmail } from '../helper';

const JANE = 'jane@example.com';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const addPrivateDataset = async (name: string): Promise<DatasetEntity> => {
  const dataset = await addDataset(name, [0, 0, 1, 1]);
  await (await getEntityManager()).getRepository(DatasetEntity).update({ id: dataset.id }, { visibility: 'private' });
  return dataset;
};

const setAccessRequests = async (enabled: boolean) => {
  await (await getEntityManager()).getRepository(JsonStorage).save({ id: THEME_CONFIG_ID, data: { accessRequestsEnabled: enabled } });
};

const datasetGrantsOf = async (subject: string) => {
  const [row] = await (await getEntityManager()).query(`SELECT data->'datasets' AS datasets FROM entitlements WHERE id = $1`, [subject]);
  return row?.datasets;
};

describe('Access Requests', () => {
  let adminToken: string;
  let janeToken: string;
  let a: DatasetEntity;
  let b: DatasetEntity;

  beforeAll(async () => {
    adminToken = await getSuperAdminToken();
  });

  beforeEach(async () => {
    janeToken = getUserToken('jane-sub', JANE);
    a = await addPrivateDataset('Alpha');
    b = await addPrivateDataset('Bravo');
    await setAccessRequests(true);
  });

  const ask = (token: string, body: object) => request(app).post('/access-requests').set(auth(token)).send(body);
  const askForBoth = () => ask(janeToken, { datasets: [a.slug, b.slug], capabilities: ['preview', 'download'], message: 'For my thesis' });
  const decide = (id: string, decisions: object[]) =>
    request(app).post(`/access-requests/${id}/decisions`).set(auth(adminToken)).send({ decisions });

  describe('asking', () => {
    it('records one pending request covering every Dataset', async () => {
      const res = await askForBoth();

      expect(res.statusCode).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        requested_by: JANE,
        capabilities: ['download', 'preview'],
        message: 'For my thesis',
        status: 'pending',
        items: [
          { dataset: { slug: a.slug, name: 'Alpha' }, status: 'pending', granted: null },
          { dataset: { slug: b.slug, name: 'Bravo' }, status: 'pending', granted: null },
        ],
      });
      expect(res.body.items[0].decided_by).toBeUndefined();
    });

    it('is refused while admins have not turned it on', async () => {
      await setAccessRequests(false);
      expect((await askForBoth()).statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('refuses a public Dataset, an unknown one, and an admin', async () => {
      const open = await addDataset('Open', [0, 0, 1, 1]);
      expect((await ask(janeToken, { datasets: [open.slug], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.BAD_REQUEST);
      expect((await ask(janeToken, { datasets: ['no-such-dataset'], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.NOT_FOUND);
      expect((await ask(adminToken, { datasets: [a.slug], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('refuses asking for what the requester already holds, but not for more', async () => {
      await request(app)
        .put(`/datasets/${a.slug}/entitlements`)
        .set(auth(adminToken))
        .send({ [JANE]: ['preview'] })
        .expect(StatusCodes.OK);

      expect((await ask(janeToken, { datasets: [a.slug], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.BAD_REQUEST);
      expect((await ask(janeToken, { datasets: [a.slug], capabilities: ['preview', 'download'] })).statusCode).toBe(StatusCodes.CREATED);
    });

    it('allows one pending request per Dataset, pointing to it', async () => {
      const first = (await askForBoth()).body;

      const again = await ask(janeToken, { datasets: [b.slug], capabilities: ['preview'] });
      expect(again.statusCode).toBe(StatusCodes.CONFLICT);
      expect(again.body.pending_request_id).toBe(first.id);

      await request(app).delete(`/access-requests/${first.id}`).set(auth(janeToken)).expect(StatusCodes.NO_CONTENT);
      expect((await ask(janeToken, { datasets: [b.slug], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.CREATED);
    });

    it('refuses a token without email and a Machine caller', async () => {
      for (const caller of [getUserTokenWithoutEmail('jane-sub'), getMachineToken('robot')]) {
        const refused = await ask(caller, { datasets: [a.slug], capabilities: ['preview'] });
        expect(refused.statusCode).toBe(StatusCodes.FORBIDDEN);
        expect(refused.body.email_required).toBe(true);
      }
      const admin = await request(app).get('/access-requests').set(auth(adminToken)).expect(StatusCodes.OK);
      expect(admin.body).toEqual([]);
    });
  });

  describe('deciding', () => {
    it('grants an approval to the requester, shows a denial reason, and lets her ask again', async () => {
      const { id } = (await askForBoth()).body;

      const res = await decide(id, [
        { dataset: a.slug, approve: true, capabilities: ['preview'] },
        { dataset: b.slug, approve: false, reason: 'Under embargo until 2027' },
      ]);
      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.body.status).toBe('finished');
      expect(res.body.items[0]).toMatchObject({ status: 'approved', granted: ['preview'], decided_by: 'super-admin@localhost' });

      expect(await datasetGrantsOf(JANE)).toEqual({ [a.slug]: ['preview'] });
      const mine = await request(app).get('/access-requests/mine').set(auth(janeToken)).expect(StatusCodes.OK);
      expect(mine.body[0].items[1]).toMatchObject({ status: 'denied', reason: 'Under embargo until 2027' });
      expect(mine.body[0].items[1].decided_by).toBeUndefined();

      expect((await ask(janeToken, { datasets: [b.slug], capabilities: ['preview'] })).statusCode).toBe(StatusCodes.CREATED);
    });

    it('lets each Dataset be decided once', async () => {
      const { id } = (await askForBoth()).body;
      await decide(id, [{ dataset: a.slug, approve: false }]).expect(StatusCodes.OK);

      expect((await decide(id, [{ dataset: a.slug, approve: true }])).statusCode).toBe(StatusCodes.CONFLICT);
      expect(await datasetGrantsOf(JANE)).toBeUndefined();
    });

    it('refuses granting more than was asked for', async () => {
      const { id } = (await ask(janeToken, { datasets: [a.slug], capabilities: ['preview'] })).body;
      expect((await decide(id, [{ dataset: a.slug, approve: true, capabilities: ['download'] }])).statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('lists pending requests for admins only, oldest first', async () => {
      const first = (await ask(janeToken, { datasets: [a.slug], capabilities: ['preview'] })).body;
      const second = (await ask(getUserToken('joe-sub', 'joe@example.com'), { datasets: [a.slug], capabilities: ['preview'] })).body;
      await decide(first.id, [{ dataset: a.slug, approve: true }]).expect(StatusCodes.OK);

      const pending = await request(app).get('/access-requests').set(auth(adminToken)).expect(StatusCodes.OK);
      expect(pending.body.map((item: { id: string }) => item.id)).toEqual([second.id]);
      expect((await request(app).get('/access-requests').set(auth(janeToken))).statusCode).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('withdrawing', () => {
    it('withdraws what is still pending, only for the requester', async () => {
      const { id } = (await askForBoth()).body;
      await decide(id, [{ dataset: a.slug, approve: true }]).expect(StatusCodes.OK);

      expect(
        (
          await request(app)
            .delete(`/access-requests/${id}`)
            .set(auth(getUserToken('joe-sub', 'joe@example.com')))
        ).statusCode,
      ).toBe(StatusCodes.NOT_FOUND);
      await request(app).delete(`/access-requests/${id}`).set(auth(janeToken)).expect(StatusCodes.NO_CONTENT);

      const mine = await request(app).get('/access-requests/mine').set(auth(janeToken)).expect(StatusCodes.OK);
      expect(mine.body[0].items.map((item: { status: string }) => item.status)).toEqual(['approved', 'withdrawn']);
      expect((await request(app).delete(`/access-requests/${id}`).set(auth(janeToken))).statusCode).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('a Purge', () => {
    const purge = async (dataset: DatasetEntity) =>
      new AccessRequestService().dropDataset({ entityManager: await getEntityManager(), entitlements: {} } as RequestData, dataset.id);

    it('removes the Dataset from pending requests and ends one left with nothing', async () => {
      const only = (await ask(janeToken, { datasets: [a.slug], capabilities: ['preview'] })).body;
      const both = (await ask(getUserToken('joe-sub', 'joe@example.com'), { datasets: [a.slug, b.slug], capabilities: ['preview'] })).body;

      await purge(a);

      const manager = await getEntityManager();
      expect(await manager.query(`SELECT id FROM access_requests WHERE id = $1`, [only.id])).toEqual([]);
      const left: { dataset_id: string }[] = await manager.query(`SELECT dataset_id FROM access_request_items WHERE request_id = $1`, [
        both.id,
      ]);
      expect(left.map(row => row.dataset_id)).toEqual([b.id]);
    });

    it('keeps decided ones as history', async () => {
      const { id } = (await ask(janeToken, { datasets: [a.slug], capabilities: ['preview'] })).body;
      await decide(id, [{ dataset: a.slug, approve: true }]).expect(StatusCodes.OK);

      await purge(a);

      const mine = await request(app).get('/access-requests/mine').set(auth(janeToken)).expect(StatusCodes.OK);
      expect(mine.body[0].items[0]).toMatchObject({ dataset: { slug: a.slug }, status: 'approved' });
    });
  });
});
