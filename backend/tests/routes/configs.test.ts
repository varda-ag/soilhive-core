import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getSuperAdminToken, getUserToken } from '../helper';
import { IncomingHttpHeaders } from 'http';
import { EVERYONE } from '../../src/constants/constants';
import { addDataset } from '../../src/utils/mock';
import DatasetEntity from '../../src/entities/Dataset';
import { IngestionStatus } from '../../src/types/data';

const ID = 'test-config';

describe('Testing /configs/{id} routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    // Get super admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });
  it('PUT saves the config', async () => {
    const data = { customValue: 123.456 };
    const res = await request(app).put('/configs/test-config').set(superAdminAuthHeader).send(data);
    expect(res.statusCode).toBe(200);
    const row = await getTestConfigFromDB();
    expect(row).toBeDefined();
    expect(row!.id).toStrictEqual(ID);
    expect(row!.data).toStrictEqual(data);
  });

  it('GET responds with not found for a privileged caller', async () => {
    const res = await request(app).get('/configs/wrong-id').set(superAdminAuthHeader);
    expect(res.statusCode).toBe(404);
  });

  it('GET responds with 403 for an anonymous caller with no READ/WRITE grant', async () => {
    await createTestConfigInDB({ key: 'value' });
    const res = await request(app).get('/configs/test-config');
    expect(res.statusCode).toBe(403);
  });

  it('GET responds with the expected config for an anonymous caller covered by an EVERYONE READ grant', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    await grantConfigCapability(EVERYONE, ID, ['read']);
    const res = await request(app).get('/configs/test-config');
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it('GET responds with the expected config for a non-admin caller holding READ', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const subjectEmail = 'reader@example.com';
    const token = getUserToken('reader-id', subjectEmail);
    await grantConfigCapability(subjectEmail, ID, ['read']);

    const res = await request(app).get('/configs/test-config').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it('GET responds with 403 naming the private Datasets of a dashboard the caller may not preview', async () => {
    const dashboardId = 'plugin:dashboards:dashboards:t1';
    await addPrivateDataset('ds-x');
    await addDataset('ds-public', [0, 0, 1, 1]);
    await (await getDataSource())
      .getRepository('JsonStorage')
      .save({ id: dashboardId, data: { name: 'D', datasets: ['ds-x', 'ds-public'] } });
    const subjectEmail = 'reader@example.com';
    await grantConfigCapability(subjectEmail, dashboardId, ['read']);

    const res = await request(app)
      .get(`/configs/${dashboardId}`)
      .set('Authorization', `Bearer ${getUserToken('reader-id', subjectEmail)}`);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ status: 403, datasets: ['ds-x'], has_unavailable_datasets: false });
  });

  // ADR-0079: a writer must not drop the check by saving other Datasets.
  describe('PUT on a stored dashboard listing a private Dataset', () => {
    const dashboardId = 'plugin:dashboards:dashboards:t1';
    const stored = { name: 'D', datasets: ['ds-x'] };
    const writer = 'writer@example.com';
    const writerHeader = () => ({ Authorization: `Bearer ${getUserToken('writer-id', writer)}` });
    const putWithoutDatasets = (headers: IncomingHttpHeaders) =>
      request(app).put(`/configs/${dashboardId}`).set(headers).send({ name: 'D', datasets: [] });

    beforeEach(async () => {
      await addPrivateDataset('ds-x');
      await (await getDataSource()).getRepository('JsonStorage').save({ id: dashboardId, data: stored });
      await grantConfigCapability(writer, dashboardId, ['write']);
    });

    it('responds with 403 and writes nothing when the writer may not preview it', async () => {
      const res = await putWithoutDatasets(writerHeader());
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ status: 403, datasets: ['ds-x'], has_unavailable_datasets: false });
      expect((await getTestConfigFromDBById(dashboardId))!.data).toStrictEqual(stored);
    });

    it('saves when the writer may preview it', async () => {
      await grantCapability(writer, 'datasets', 'ds-x', ['preview']);
      const res = await putWithoutDatasets(writerHeader());
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual({ name: 'D', datasets: [] });
    });

    it('saves for a privileged caller', async () => {
      const res = await putWithoutDatasets(superAdminAuthHeader);
      expect(res.statusCode).toBe(200);
    });
  });

  it('DELETE removes the config', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const res = await request(app).delete('/configs/test-config').set(superAdminAuthHeader);
    expect(res.statusCode).toBe(204);
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
  });

  it('DELETE responds with 403 for a non-admin caller with no WRITE grant', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const token = getUserToken('no-grant-id', 'no-grant@example.com');

    const res = await request(app).delete('/configs/test-config').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
    const row = await getTestConfigFromDB();
    expect(row).not.toBeNull();
  });

  it('Deletes (soft) an existing config, then creates it again: it should be restored', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    await request(app).delete('/configs/test-config').set(superAdminAuthHeader);
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
    await request(app).put('/configs/test-config').set(superAdminAuthHeader).send(data);
    const row2 = await getTestConfigFromDB();
    expect(row2).not.toBeNull();
  });

  // A plugin config delete needs pg-boss, so its tests live in data-requests.test.ts.
  it('DELETE on a host config keeps its entitlements', async () => {
    await createTestConfigInDB({ key: 'value' });
    await grantConfigCapability(EVERYONE, ID, ['read']);

    const res = await request(app).delete('/configs/test-config').set(superAdminAuthHeader);

    expect(res.statusCode).toBe(204);
    expect(await getConfigGrants()).toEqual({ [EVERYONE]: { [ID]: ['read'] } });
  });

  it('Exports all the configs', async () => {
    const a = { customValue: 123.456 };
    const b = { anotherValue: 'test' };
    await request(app).put('/configs/a').set(superAdminAuthHeader).send(a);
    await request(app).put('/configs/b').set(superAdminAuthHeader).send(b);
    const res = await request(app).post('/configs-export').set(superAdminAuthHeader);
    expect(res.body).toEqual({
      a: a,
      b: b,
    });
  });

  it('Tries to save a config without authorization', async () => {
    const data = { customValue: 123.456 };
    const res = await request(app).put('/configs/test-config').send(data);
    expect(res.statusCode).toBe(401);
  });

  it('PUT claims a fresh plugin: config id on first access and self-grants WRITE', async () => {
    const pluginConfigId = 'plugin:acme:widget';
    const subjectEmail = 'claimant@example.com';
    const token = getUserToken('claimant-id', subjectEmail);
    const data = { setting: true };

    const res = await request(app).put(`/configs/${pluginConfigId}`).set('Authorization', `Bearer ${token}`).send(data);

    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
    const entityManager = await getEntityManager();
    const [row] = await entityManager.query(`SELECT data->'configs' AS configs FROM entitlements WHERE id = $1`, [subjectEmail]);
    expect(row.configs).toEqual({ [pluginConfigId]: ['write'] });
  });

  it('PUT rejects a different non-admin caller from claiming a plugin: id someone else already won', async () => {
    const pluginConfigId = 'plugin:acme:widget';
    const firstToken = getUserToken('first-id', 'first@example.com');
    await request(app).put(`/configs/${pluginConfigId}`).set('Authorization', `Bearer ${firstToken}`).send({ setting: 1 });

    const secondToken = getUserToken('second-id', 'second@example.com');
    const res = await request(app).put(`/configs/${pluginConfigId}`).set('Authorization', `Bearer ${secondToken}`).send({ setting: 2 });

    expect(res.statusCode).toBe(403);
  });

  it('PUT rejects a non-admin caller with no grant on a system (non-plugin) config id, even when unclaimed', async () => {
    const token = getUserToken('no-grant-id', 'no-grant@example.com');

    const res = await request(app).put('/configs/theme').set('Authorization', `Bearer ${token}`).send({ mode: 'dark' });

    expect(res.statusCode).toBe(403);
    const row = await getTestConfigFromDBById('theme');
    expect(row).toBeNull();
  });
});

describe('Testing GET /configs routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it('Returns the requested configs keyed by id for a privileged caller', async () => {
    const dataA = { customValue: 123.456 };
    const dataB = { anotherValue: 'test' };
    await request(app).put('/configs/a').set(superAdminAuthHeader).send(dataA);
    await request(app).put('/configs/b').set(superAdminAuthHeader).send(dataB);
    const res = await request(app).get('/configs').query({ ids: 'a,b' }).set(superAdminAuthHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: savedConfig(dataA), b: savedConfig(dataB) });
  });

  it('Returns updated_at as an ISO time that moves forward on each save', async () => {
    await request(app).put('/configs/a').set(superAdminAuthHeader).send({ v: 1 });
    const first = await request(app).get('/configs').query({ ids: 'a' }).set(superAdminAuthHeader);
    const firstUpdatedAt = Date.parse(first.body.a.updated_at);
    expect(first.body.a.updated_at).toBe(new Date(firstUpdatedAt).toISOString());

    await new Promise(resolve => setTimeout(resolve, 20));
    await request(app).put('/configs/a').set(superAdminAuthHeader).send({ v: 2 });
    const second = await request(app).get('/configs').query({ ids: 'a' }).set(superAdminAuthHeader);
    expect(second.body.a.data).toStrictEqual({ v: 2 });
    expect(Date.parse(second.body.a.updated_at)).toBeGreaterThan(firstUpdatedAt);
  });

  it('Silently omits ids that do not exist, for a privileged caller', async () => {
    const dataA = { customValue: 123.456 };
    await request(app).put('/configs/a').set(superAdminAuthHeader).send(dataA);
    const res = await request(app).get('/configs').query({ ids: 'a,doesnotexist' }).set(superAdminAuthHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: savedConfig(dataA) });
  });

  it('Silently omits ids an anonymous caller lacks READ/WRITE on, alongside ids that do not exist', async () => {
    const dataA = { customValue: 123.456 };
    const dataB = { anotherValue: 'test' };
    await request(app).put('/configs/a').set(superAdminAuthHeader).send(dataA);
    await request(app).put('/configs/b').set(superAdminAuthHeader).send(dataB);
    await grantConfigCapability(EVERYONE, 'a', ['read']);

    const res = await request(app).get('/configs').query({ ids: 'a,b,doesnotexist' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: savedConfig(dataA) });
  });

  describe('for a dashboards Config Kind id', () => {
    const fullDashboard = {
      name: 'D',
      type: 'custom',
      visibility: 'private',
      status: 'ready',
      soilIndexRunId: 'run-1',
      framework: 'fw',
      updated_by: 'someone@example.com',
      datasets: ['ds-x'],
      widgets: [{ id: 'w1' }],
    };
    const summary = Object.fromEntries(Object.entries(fullDashboard).filter(([key]) => !['datasets', 'widgets'].includes(key)));

    it.each(['plugin:dashboards:dashboards:t1', 'dashboards:1'])('returns only the summary keys of %s and other ids in full', async id => {
      const theme = { colour: 'red' };
      const plugin = { datasets: ['ds-x'], other: 1 };
      await request(app).put(`/configs/${id}`).set(superAdminAuthHeader).send(fullDashboard);
      await request(app).put('/configs/theme').set(superAdminAuthHeader).send(theme);
      await request(app).put('/configs/plugin:zones:zones:1').set(superAdminAuthHeader).send(plugin);

      const res = await request(app)
        .get('/configs')
        .query({ ids: `${id},theme,plugin:zones:zones:1` })
        .set(superAdminAuthHeader);
      expect(res.statusCode).toBe(200);
      expect(res.body).toStrictEqual({
        [id]: savedConfig(summary),
        theme: savedConfig(theme),
        'plugin:zones:zones:1': savedConfig(plugin),
      });
    });

    it('leaves summary keys absent when the value lacks them', async () => {
      await request(app).put('/configs/dashboards:1').set(superAdminAuthHeader).send({ name: 'D', widgets: [] });
      const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(superAdminAuthHeader);
      expect(res.body['dashboards:1'].data).toStrictEqual({ name: 'D' });
    });

    describe('for a caller the dashboard dataset check blocks', () => {
      const reader = 'reader@example.com';
      const readerHeader = () => ({ Authorization: `Bearer ${getUserToken('reader-id', reader)}` });
      const withoutRunId = Object.fromEntries(Object.entries(summary).filter(([key]) => key !== 'soilIndexRunId'));

      const saveDashboard = async (id: string, datasets: string[]) => {
        await (await getDataSource()).getRepository('JsonStorage').save({ id, data: { ...fullDashboard, datasets } });
        await grantCapability(reader, 'configs', id, ['read']);
      };

      beforeEach(async () => {
        await addPrivateDataset('ds-x');
        await addDataset('ds-public', [0, 0, 1, 1]);
      });

      it('leaves out soilIndexRunId when the caller may not preview a private Dataset', async () => {
        await saveDashboard('dashboards:1', ['ds-x', 'ds-public']);
        const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(readerHeader());
        expect(res.statusCode).toBe(200);
        expect(res.body).toStrictEqual({ 'dashboards:1': savedConfig(withoutRunId) });
      });

      it('keeps soilIndexRunId when the caller may preview every private Dataset', async () => {
        await saveDashboard('dashboards:1', ['ds-x', 'ds-public']);
        await grantCapability(reader, 'datasets', 'ds-x', ['preview']);
        const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(readerHeader());
        expect(res.body).toStrictEqual({ 'dashboards:1': savedConfig(summary) });
      });

      it('leaves out soilIndexRunId when a Dataset is unpublished', async () => {
        await (await getDataSource()).getRepository(DatasetEntity).update({ slug: 'ds-public' }, { status: IngestionStatus.LOADED });
        await saveDashboard('dashboards:1', ['ds-public']);
        const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(readerHeader());
        expect(res.body).toStrictEqual({ 'dashboards:1': savedConfig(withoutRunId) });
      });

      it('keeps soilIndexRunId for a privileged caller', async () => {
        await saveDashboard('dashboards:1', ['ds-x', 'unknown']);
        const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(superAdminAuthHeader);
        expect(res.body).toStrictEqual({ 'dashboards:1': savedConfig(summary) });
      });

      it('decides per dashboard in one call', async () => {
        await saveDashboard('dashboards:1', ['ds-x']);
        await saveDashboard('dashboards:2', ['ds-public']);
        const res = await request(app).get('/configs').query({ ids: 'dashboards:1,dashboards:2' }).set(readerHeader());
        expect(res.body).toStrictEqual({ 'dashboards:1': savedConfig(withoutRunId), 'dashboards:2': savedConfig(summary) });
      });
    });

    // PUT accepts only objects, so these values are written straight to the table
    it.each([[[{ name: 'D', widgets: [] }]], ['text']])('returns a value that is not an object unchanged: %p', async data => {
      await (await getDataSource()).getRepository('JsonStorage').save({ id: 'dashboards:1', data });
      const res = await request(app).get('/configs').query({ ids: 'dashboards:1' }).set(superAdminAuthHeader);
      expect(res.body['dashboards:1'].data).toStrictEqual(data);
    });
  });

  it('Missing ids query param should fail', async () => {
    const res = await request(app).get('/configs');
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("must have required property 'ids'");
  });

  it('Empty ids query param should fail', async () => {
    const res = await request(app).get('/configs?ids=');
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("Empty value found for query parameter 'ids'");
  });

  it('More than 100 ids should fail', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`).join(',');
    const res = await request(app).get('/configs').query({ ids });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('must NOT have more than 100 items');
  });

  it('All requested ids non-existent returns an empty object', async () => {
    const res = await request(app).get('/configs').query({ ids: 'doesnotexist1,doesnotexist2' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({});
  });
});

const savedConfig = (data: unknown) => ({ data, updated_at: expect.any(String) });

const createTestConfigInDB = async (data: any) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository('JsonStorage');
  const id = ID;
  await repo.save({ id, data });
};

const getTestConfigFromDB = async () => getTestConfigFromDBById(ID);

const getTestConfigFromDBById = async (id: string) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository('JsonStorage');
  return await repo.findOneBy({ id });
};

/** Every subject's `data.configs`, keyed by subject. */
const getConfigGrants = async (): Promise<Record<string, unknown>> => {
  const dataSource = await getDataSource();
  const rows: { id: string; configs: unknown }[] = await dataSource.query(`SELECT id, data->'configs' AS configs FROM entitlements`);
  return Object.fromEntries(rows.map(({ id, configs }) => [id, configs]));
};

/** Merges `{capabilities}` under `data.configs[configId]` for `subject`, on top of any existing grants. */
/** A published Dataset that only grant holders may see. */
const addPrivateDataset = async (slug: string) => {
  await addDataset(slug, [0, 0, 1, 1]);
  await (await getDataSource()).getRepository(DatasetEntity).update({ slug }, { visibility: 'private' });
};

const grantConfigCapability = async (subject: string, configId: string, capabilities: string[]) =>
  grantCapability(subject, 'configs', configId, capabilities);

/** Merges `{capabilities}` under `data[scope][key]` for `subject`, on top of any existing grants. */
const grantCapability = async (subject: string, scope: string, key: string, capabilities: string[]) => {
  const dataSource = await getDataSource();
  await dataSource.query(
    `INSERT INTO entitlements (id, data) VALUES ($1, jsonb_build_object($2::text, jsonb_build_object($3::text, $4::jsonb)))
     ON CONFLICT (id) DO UPDATE SET data = jsonb_set(
       entitlements.data, ARRAY[$2::text], COALESCE(entitlements.data->$2::text, '{}'::jsonb) || jsonb_build_object($3::text, $4::jsonb)
     )`,
    [subject, scope, key, JSON.stringify(capabilities)],
  );
};
