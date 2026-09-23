import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getSuperAdminToken, getUserToken } from '../helper';
import { IncomingHttpHeaders } from 'http';
import { EVERYONE } from '../../src/constants/constants';

const ID = 'test-config';

describe('Testing /config/{id} routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    // Get super admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });
  it('PUT saves the config', async () => {
    const data = { customValue: 123.456 };
    const res = await request(app).put('/config/test-config').set(superAdminAuthHeader).send(data);
    expect(res.statusCode).toBe(200);
    const row = await getTestConfigFromDB();
    expect(row).toBeDefined();
    expect(row!.id).toStrictEqual(ID);
    expect(row!.data).toStrictEqual(data);
  });

  it('GET responds with not found for a privileged caller', async () => {
    const res = await request(app).get('/config/wrong-id').set(superAdminAuthHeader);
    expect(res.statusCode).toBe(404);
  });

  it('GET responds with 403 for an anonymous caller with no READ/WRITE grant', async () => {
    await createTestConfigInDB({ key: 'value' });
    const res = await request(app).get('/config/test-config');
    expect(res.statusCode).toBe(403);
  });

  it('GET responds with the expected config for an anonymous caller covered by an EVERYONE READ grant', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    await grantConfigCapability(EVERYONE, ID, ['read']);
    const res = await request(app).get('/config/test-config');
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it('GET responds with the expected config for a non-admin caller holding READ', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const subjectEmail = 'reader@example.com';
    const token = getUserToken('reader-id', subjectEmail);
    await grantConfigCapability(subjectEmail, ID, ['read']);

    const res = await request(app).get('/config/test-config').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it('DELETE removes the config', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const res = await request(app).delete('/config/test-config').set(superAdminAuthHeader);
    expect(res.statusCode).toBe(204);
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
  });

  it('DELETE responds with 403 for a non-admin caller with no WRITE grant', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    const token = getUserToken('no-grant-id', 'no-grant@example.com');

    const res = await request(app).delete('/config/test-config').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
    const row = await getTestConfigFromDB();
    expect(row).not.toBeNull();
  });

  it('Deletes (soft) an existing config, then creates it again: it should be restored', async () => {
    const data = { key: 'value' };
    await createTestConfigInDB(data);
    await request(app).delete('/config/test-config').set(superAdminAuthHeader);
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
    await request(app).put('/config/test-config').set(superAdminAuthHeader).send(data);
    const row2 = await getTestConfigFromDB();
    expect(row2).not.toBeNull();
  });

  it('Exports all the configs', async () => {
    const a = { customValue: 123.456 };
    const b = { anotherValue: 'test' };
    await request(app).put('/config/a').set(superAdminAuthHeader).send(a);
    await request(app).put('/config/b').set(superAdminAuthHeader).send(b);
    const res = await request(app).post('/config-export').set(superAdminAuthHeader);
    expect(res.body).toEqual({
      a: a,
      b: b,
    });
  });

  it('Tries to save a config without authorization', async () => {
    const data = { customValue: 123.456 };
    const res = await request(app).put('/config/test-config').send(data);
    expect(res.statusCode).toBe(401);
  });

  it('PUT claims a fresh plugin: config id on first access and self-grants WRITE', async () => {
    const pluginConfigId = 'plugin:acme:widget';
    const subjectEmail = 'claimant@example.com';
    const token = getUserToken('claimant-id', subjectEmail);
    const data = { setting: true };

    const res = await request(app).put(`/config/${pluginConfigId}`).set('Authorization', `Bearer ${token}`).send(data);

    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
    const entityManager = await getEntityManager();
    const [row] = await entityManager.query(`SELECT data->'configs' AS configs FROM entitlements WHERE id = $1`, [subjectEmail]);
    expect(row.configs).toEqual({ [pluginConfigId]: ['write'] });
  });

  it('PUT rejects a different non-admin caller from claiming a plugin: id someone else already won', async () => {
    const pluginConfigId = 'plugin:acme:widget';
    const firstToken = getUserToken('first-id', 'first@example.com');
    await request(app).put(`/config/${pluginConfigId}`).set('Authorization', `Bearer ${firstToken}`).send({ setting: 1 });

    const secondToken = getUserToken('second-id', 'second@example.com');
    const res = await request(app).put(`/config/${pluginConfigId}`).set('Authorization', `Bearer ${secondToken}`).send({ setting: 2 });

    expect(res.statusCode).toBe(403);
  });

  it('PUT rejects a non-admin caller with no grant on a system (non-plugin) config id, even when unclaimed', async () => {
    const token = getUserToken('no-grant-id', 'no-grant@example.com');

    const res = await request(app).put('/config/theme').set('Authorization', `Bearer ${token}`).send({ mode: 'dark' });

    expect(res.statusCode).toBe(403);
    const row = await getTestConfigFromDBById('theme');
    expect(row).toBeNull();
  });
});

describe('Testing GET /config routes', () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it('Returns the requested configs keyed by id for a privileged caller', async () => {
    const dataA = { customValue: 123.456 };
    const dataB = { anotherValue: 'test' };
    await request(app).put('/config/a').set(superAdminAuthHeader).send(dataA);
    await request(app).put('/config/b').set(superAdminAuthHeader).send(dataB);
    const res = await request(app).get('/config').query({ ids: 'a,b' }).set(superAdminAuthHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: dataA, b: dataB });
  });

  it('Silently omits ids that do not exist, for a privileged caller', async () => {
    const dataA = { customValue: 123.456 };
    await request(app).put('/config/a').set(superAdminAuthHeader).send(dataA);
    const res = await request(app).get('/config').query({ ids: 'a,doesnotexist' }).set(superAdminAuthHeader);
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: dataA });
  });

  it('Silently omits ids an anonymous caller lacks READ/WRITE on, alongside ids that do not exist', async () => {
    const dataA = { customValue: 123.456 };
    const dataB = { anotherValue: 'test' };
    await request(app).put('/config/a').set(superAdminAuthHeader).send(dataA);
    await request(app).put('/config/b').set(superAdminAuthHeader).send(dataB);
    await grantConfigCapability(EVERYONE, 'a', ['read']);

    const res = await request(app).get('/config').query({ ids: 'a,b,doesnotexist' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({ a: dataA });
  });

  it('Missing ids query param should fail', async () => {
    const res = await request(app).get('/config');
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("must have required property 'ids'");
  });

  it('Empty ids query param should fail', async () => {
    const res = await request(app).get('/config?ids=');
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain("Empty value found for query parameter 'ids'");
  });

  it('More than 100 ids should fail', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`).join(',');
    const res = await request(app).get('/config').query({ ids });
    expect(res.statusCode).toBe(400);
    expect(res.body.detail).toContain('must NOT have more than 100 items');
  });

  it('All requested ids non-existent returns an empty object', async () => {
    const res = await request(app).get('/config').query({ ids: 'doesnotexist1,doesnotexist2' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual({});
  });
});

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

/** Merges `{capabilities}` under `data.configs[configId]` for `subject`, on top of any existing grants. */
const grantConfigCapability = async (subject: string, configId: string, capabilities: string[]) => {
  const dataSource = await getDataSource();
  await dataSource.query(
    `INSERT INTO entitlements (id, data) VALUES ($1, jsonb_build_object('configs', jsonb_build_object($2::text, $3::jsonb)))
     ON CONFLICT (id) DO UPDATE SET data = jsonb_set(
       entitlements.data, '{configs}', COALESCE(entitlements.data->'configs', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)
     )`,
    [subject, configId, JSON.stringify(capabilities)],
  );
};
