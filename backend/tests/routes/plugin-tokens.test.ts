import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createPublicKey } from 'crypto';
import { StatusCodes } from 'http-status-codes';
import jwt, { JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../../src/app';
import { INTERNAL_REQUEST_TOKEN_PAYLOAD } from '../../src/constants/constants';
import { getSwaggerDocument } from '../../src/middlewares/openapi';
import DatasetService from '../../src/services/DatasetService';
import { MINTS_PER_SUBJECT_PER_WINDOW, MINTS_PER_WINDOW, resetPluginTokenRateLimit } from '../../src/services/PluginTokenService';
import { Capability, JobQueues, SoilIndexType, StatisticsType } from '../../src/types/enums';
import * as dataSourceModule from '../../src/utils/data-source';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import { getPasswordGrantKey } from '../../src/utils/password-grant-key';
import { getPluginTokenKey } from '../../src/utils/plugin-token-key';
import { signToken } from '../../src/utils/utils';
import { getDataAdminToken, getSuperAdminToken, getUserToken } from '../helper';

const CORE_PUBLIC_URL = 'https://api.example/api/v1';
const PLUGIN_ID = 'zones-plugin';

// getUserToken resets the test env, so tokens are signed before the settings are applied
const enablePluginTokens = (adminPlugins?: string): void => {
  process.env.PLUGIN_TOKEN_SECRET = 'a-plugin-token-secret-of-at-least-32-characters';
  process.env.CORE_PUBLIC_URL = `${CORE_PUBLIC_URL}/`;
  if (adminPlugins) {
    process.env.PLUGIN_TOKEN_ADMIN_PLUGINS = adminPlugins;
  }
};

const mint = (userToken: string, pluginId = PLUGIN_ID) =>
  request(app).post(`/api/v1/plugins/${pluginId}/token`).set('Authorization', `Bearer ${userToken}`);

const mintToken = async (userToken: string, pluginId = PLUGIN_ID): Promise<string> => {
  const res = await mint(userToken, pluginId);
  expect(res.statusCode).toBe(StatusCodes.OK);
  return res.body.access_token;
};

const decode = (token: string) => jwt.decode(token, { complete: true })!;

describe('Plugin tokens', () => {
  const userEmail = 'plugin-user@example.com';
  let userToken: string;

  beforeEach(() => {
    resetPluginTokenRateLimit();
    userToken = getUserToken('plugin-user-id', userEmail);
    enablePluginTokens();
  });

  describe('POST /plugins/{pluginId}/token', () => {
    it('signs a Plugin token for the caller and the plugin, never cached', async () => {
      const before = Math.floor(Date.now() / 1000);
      const res = await mint(userToken);

      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({ access_token: expect.any(String), token_type: 'Bearer', expires_in: 300 });
      const { header, payload } = decode(res.body.access_token);
      expect(header).toEqual({ alg: 'ES256', typ: 'plugin+jwt', kid: getPluginTokenKey()!.kid });
      expect(payload).toEqual({
        iss: CORE_PUBLIC_URL, // the trailing slash of the setting is dropped
        aud: `plugin:${PLUGIN_ID}`,
        sub: userEmail, // the Subject, not the user token's sub
        iat: expect.any(Number),
        exp: expect.any(Number),
        jti: expect.any(String),
      });
      const { iat, exp } = payload as JwtPayload;
      expect(iat).toBeGreaterThanOrEqual(before);
      expect(exp! - iat!).toBe(300);
    });

    it('answers under both servers', async () => {
      const res = await request(app).post(`/plugins/${PLUGIN_ID}/token`).set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
    });

    it('never outlives the user token', async () => {
      const shortLived = getUserTokenExpiringIn(60);
      enablePluginTokens();
      const res = await mint(shortLived);

      const { iat, exp } = decode(res.body.access_token).payload as JwtPayload;
      expect(exp! - iat!).toBeLessThanOrEqual(60);
      expect(res.body.expires_in).toBeLessThanOrEqual(60);
    });

    it('refuses an anonymous caller', async () => {
      const res = await request(app).post(`/plugins/${PLUGIN_ID}/token`);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it.each(['-starts-with-dash', 'has space', 'a'.repeat(129), 'plugin:other'])('refuses the pluginId %p', async pluginId => {
      const res = await mint(userToken, encodeURIComponent(pluginId));
      expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('refuses an internal-request token', async () => {
      const res = await mint(signToken(INTERNAL_REQUEST_TOKEN_PAYLOAD, 60));
      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('refuses a Plugin token, which only reads', async () => {
      const pluginToken = await mintToken(userToken);
      const res = await mint(pluginToken);
      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.detail).toBe('A Plugin token only reads');
    });

    it.each([
      ['PLUGIN_TOKEN_SECRET is unset', { PLUGIN_TOKEN_SECRET: undefined }],
      ['PLUGIN_TOKEN_SECRET is too short', { PLUGIN_TOKEN_SECRET: 'short' }],
      ['CORE_PUBLIC_URL is unset', { CORE_PUBLIC_URL: undefined }],
      ['CORE_PUBLIC_URL is not an http(s) URL', { CORE_PUBLIC_URL: 'ftp://api.example' }],
    ])('answers 503 when %s', async (_, env) => {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      const res = await mint(userToken);
      expect(res.statusCode).toBe(StatusCodes.SERVICE_UNAVAILABLE);
    });

    it(`allows ${MINTS_PER_WINDOW} mints a minute per Subject and plugin`, async () => {
      for (let i = 0; i < MINTS_PER_WINDOW; i++) {
        expect((await mint(userToken)).statusCode).toBe(StatusCodes.OK);
      }
      const res = await mint(userToken);
      expect(res.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);

      // Another plugin, or another Subject, has its own count
      expect((await mint(userToken, 'other-plugin')).statusCode).toBe(StatusCodes.OK);
      const otherUser = getUserToken('other-user-id', 'other-user@example.com');
      enablePluginTokens();
      expect((await mint(otherUser)).statusCode).toBe(StatusCodes.OK);
    });

    it(`allows ${MINTS_PER_SUBJECT_PER_WINDOW} mints a minute per Subject, whatever the pluginIds`, async () => {
      // Any well-formed pluginId is accepted, so a per-plugin limit alone would not bound a caller
      const perPlugin = MINTS_PER_WINDOW / 2;
      for (let i = 0; i < MINTS_PER_SUBJECT_PER_WINDOW; i++) {
        expect((await mint(userToken, `plugin-${Math.floor(i / perPlugin)}`)).statusCode).toBe(StatusCodes.OK);
      }
      const res = await mint(userToken, 'yet-another-plugin');
      expect(res.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      // Another Subject keeps its own budget
      const otherUser = getUserToken('other-user-id', 'other-user@example.com');
      enablePluginTokens();
      expect((await mint(otherUser, 'yet-another-plugin')).statusCode).toBe(StatusCodes.OK);
    });

    it("never spends the Subject's budget on mints a plugin's own limit refuses", async () => {
      for (let i = 0; i < MINTS_PER_WINDOW; i++) {
        expect((await mint(userToken)).statusCode).toBe(StatusCodes.OK);
      }
      // As many refusals as would use up the Subject's budget, were they counted
      for (let i = MINTS_PER_WINDOW; i < MINTS_PER_SUBJECT_PER_WINDOW; i++) {
        expect((await mint(userToken)).statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
      }
      expect((await mint(userToken, 'other-plugin')).statusCode).toBe(StatusCodes.OK);
    });

    describe('admin rights', () => {
      it('drops the admin scopes of an admin caller', async () => {
        const pluginToken = await mintToken(await getSuperAdminToken());
        expect(decode(pluginToken).payload).not.toHaveProperty('scope');
      });

      it('keeps only the admin scopes for a plugin the deployment lists', async () => {
        enablePluginTokens(`other-plugin, ${PLUGIN_ID}`);
        const pluginToken = await mintToken(await getSuperAdminToken());
        expect(decode(pluginToken).payload).toHaveProperty('scope', 'super-admin data-admin');

        const userPluginToken = await mintToken(userToken);
        expect(decode(userPluginToken).payload).not.toHaveProperty('scope');
      });
    });
  });

  it('opens no database transaction to mint or to publish the key', async () => {
    const dataSource = jest.spyOn(dataSourceModule, 'getDataSource');
    expect((await mint(userToken)).statusCode).toBe(StatusCodes.OK);
    expect((await request(app).get('/api/v1/.well-known/plugin-jwks.json')).statusCode).toBe(StatusCodes.OK);
    expect(dataSource).not.toHaveBeenCalled();
    dataSource.mockRestore();
  });

  describe('GET /.well-known/plugin-jwks.json', () => {
    it('publishes the plugin key alone, cacheable, in password mode too', async () => {
      const res = await request(app).get('/.well-known/plugin-jwks.json');

      expect(res.statusCode).toBe(StatusCodes.OK);
      expect(res.headers['cache-control']).toBe('public, max-age=300');
      expect(res.body).toEqual({ keys: [getPluginTokenKey()!.jwk] });
      expect(res.body.keys[0].kid).not.toBe(getPasswordGrantKey().kid);
    });

    it('publishes the key that verifies a Plugin token', async () => {
      const [jwk] = (await request(app).get('/.well-known/plugin-jwks.json')).body.keys;
      const pluginToken = await mintToken(userToken);

      const verified = jwt.verify(pluginToken, createPublicKey({ key: jwk, format: 'jwk' }), {
        algorithms: ['ES256'],
        issuer: CORE_PUBLIC_URL,
        audience: `plugin:${PLUGIN_ID}`,
      });
      expect(verified).toMatchObject({ sub: userEmail });
    });

    it('is not in the password-grant key set, which keeps verifying user tokens only', async () => {
      const res = await request(app).get('/.well-known/jwks.json');
      expect(res.body.keys.map((key: { kid: string }) => key.kid)).toEqual([getPasswordGrantKey().kid]);
    });

    it.each(['PLUGIN_TOKEN_SECRET', 'CORE_PUBLIC_URL'])('answers 404 when %s is unset', async name => {
      delete process.env[name];
      const res = await request(app).get('/.well-known/plugin-jwks.json');
      expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('a Plugin token on the core API', () => {
    const slug = 'test_dataset_1';

    beforeEach(async () => {
      const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 1 });
      const entityManager = await getEntityManager();
      const adminToken = { sub: 'admin', scope: 'super-admin', raw: '', isSuperAdmin: true, isDataAdmin: true, isInternalRequest: false };
      await new DatasetService().updateDataset({ entityManager, token: adminToken, entitlements: {} }, dataset.slug, {
        visibility: 'private',
      });
      await entityManager.query(`
        INSERT INTO entitlements (id, data) VALUES
        ('everyone', '{"datasets": {"${slug}": ["download"]}}'),
        ('${userEmail}', '{"datasets": {"${slug}": ["preview"]}}')
      `);
    });

    it('reads what its user may read', async () => {
      const pluginToken = await mintToken(userToken);

      const userRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${userToken}`);
      const pluginRes = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${pluginToken}`);

      expect(pluginRes.statusCode).toBe(StatusCodes.OK);
      expect(pluginRes.body.capabilities).toEqual([Capability.DOWNLOAD, Capability.PREVIEW]);
      expect(pluginRes.body.capabilities).toEqual(userRes.body.capabilities);
    });

    it('is accepted for any plugin, since the core reads with it too', async () => {
      const pluginToken = await mintToken(userToken, 'another-plugin');
      const res = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${pluginToken}`);
      expect(res.statusCode).toBe(StatusCodes.OK);
    });

    // These routes also accept no token, so the validator drops the security handler's 403 and the
    // refusal must come from authMiddleware: the request must never reach the handler
    it.each([
      ['POST', '/jobs', () => ({ type: JobQueues.EXPORT, filter_id: uuidv4(), formats: ['csv'], dataset_ids: [slug] })],
      ['DELETE', `/jobs/${uuidv4()}`, undefined],
      [
        'POST',
        '/data-requests',
        () => ({
          statistics_type: StatisticsType.DESCRIPTIVE,
          filter_id: uuidv4(),
          variable: { type: 'soil-property', id: 'ph' },
          time_aggregation: 1,
        }),
      ],
      ['DELETE', `/data-requests/${uuidv4()}`, undefined],
      ['POST', '/soil-indexes', () => ({ soil_index_type: SoilIndexType.CREA_INDEX, filter_id: uuidv4() })],
      ['DELETE', `/soil-indexes/${uuidv4()}`, undefined],
      ['POST', '/data-filters', () => ({ parameters: {}, geometries: [] })],
    ])('refuses %s %s, whose security also allows no token', async (method, path, body) => {
      const pluginToken = await mintToken(userToken);
      const req = method === 'POST' ? request(app).post(path).send(body!()) : request(app).delete(path);

      const res = await req.set('Authorization', `Bearer ${pluginToken}`);

      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.detail).toBe('A Plugin token only reads');
    });

    it('never creates a filter', async () => {
      const pluginToken = await mintToken(userToken);
      const repo = (await getDataSource()).getRepository('DataFilterEntity');
      const before = await repo.count();

      await request(app).post('/data-filters').set('Authorization', `Bearer ${pluginToken}`).send({ parameters: {}, geometries: [] });

      expect(await repo.count()).toBe(before);
    });

    it('refuses a write on a route that requires a token', async () => {
      const pluginToken = await mintToken(userToken);
      const res = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${pluginToken}`).send({});
      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it.each(['/data-filters', `/datasets/${slug}/entitlements`, `/configs/plugin:${PLUGIN_ID}:x/entitlements`])(
      'refuses the read %s',
      async path => {
        enablePluginTokens(PLUGIN_ID); // admin rights, which the deny list overrides
        const pluginToken = await mintToken(await getSuperAdminToken());
        const res = await request(app).get(path).set('Authorization', `Bearer ${pluginToken}`);
        expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
        expect(res.body.detail).toBe('This route does not accept a Plugin token');
      },
    );

    describe('admin rights', () => {
      it('has none by default, even for an admin', async () => {
        const pluginToken = await mintToken(await getDataAdminToken());
        const res = await request(app).get(`/datasets/${slug}/mappings`).set('Authorization', `Bearer ${pluginToken}`);
        expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
      });

      it('keeps the admin scopes for a listed plugin, still read-only', async () => {
        enablePluginTokens(PLUGIN_ID);
        const pluginToken = await mintToken(await getDataAdminToken());

        const read = await request(app).get(`/datasets/${slug}/mappings`).set('Authorization', `Bearer ${pluginToken}`);
        expect(read.statusCode).toBe(StatusCodes.OK);
        const write = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${pluginToken}`).send({});
        expect(write.statusCode).toBe(StatusCodes.FORBIDDEN);
      });

      it('loses them once the plugin is no longer listed, tokens already minted included', async () => {
        enablePluginTokens(PLUGIN_ID);
        const pluginToken = await mintToken(await getDataAdminToken());
        delete process.env.PLUGIN_TOKEN_ADMIN_PLUGINS;

        const res = await request(app).get(`/datasets/${slug}/mappings`).set('Authorization', `Bearer ${pluginToken}`);
        expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
      });
    });

    it.each([
      ['another issuer', { iss: 'https://elsewhere.example/api/v1' }, 'plugin+jwt'],
      ['no plugin audience', { aud: 'zones-plugin' }, 'plugin+jwt'],
      ['two audiences', { aud: [`plugin:${PLUGIN_ID}`, 'plugin:other'] }, 'plugin+jwt'],
      ['an expiry in the past', { exp: Math.floor(Date.now() / 1000) - 10 }, 'plugin+jwt'],
      ['another token type', {}, 'JWT'],
    ])('refuses a token with %s', async (_, claims, typ) => {
      const key = getPluginTokenKey()!;
      const payload = {
        iss: CORE_PUBLIC_URL,
        aud: `plugin:${PLUGIN_ID}`,
        sub: userEmail,
        exp: Math.floor(Date.now() / 1000) + 60,
        ...claims,
      };
      const token = jwt.sign(payload, key.privateKey, { algorithm: 'ES256', keyid: key.kid, header: { alg: 'ES256', typ } });

      const res = await request(app).get(`/datasets/${slug}`).set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('ignores a pluginId claim on a user token', async () => {
      const token = getUserTokenWith({ pluginId: PLUGIN_ID });
      enablePluginTokens();
      const res = await request(app).put(`/datasets/${slug}/entitlements`).set('Authorization', `Bearer ${token}`).send({});
      // Refused for lacking admin rights, not as a Plugin token
      expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.detail).not.toBe('A Plugin token only reads');
    });
  });

  describe('which reads a Plugin token may make', () => {
    // Every GET must be decided here, so a new read is never opened to Plugin Backends by default
    const DENIED = ['/configs/{configId}/entitlements', '/data-filters', '/datasets/{datasetId}/entitlements', '/files/{fileId}/download'];

    it('denies exactly the reads listed, and nothing else', async () => {
      const doc = (await getSwaggerDocument()) as { paths: Record<string, { get?: Record<string, unknown> }> };
      const denied = Object.entries(doc.paths)
        .filter(([, operations]) => operations.get?.['x-plugin-token-denied'])
        .map(([path]) => path)
        .sort();
      expect(denied).toEqual([...DENIED].sort());
      expect(Object.values(doc.paths).filter(operations => operations.get).length).toBe(ALLOWED_GET_COUNT + DENIED.length);
    });
  });
});

// Every GET a Plugin token may make, as audited for docs/adr/0063; a new GET changes this count
const ALLOWED_GET_COUNT = 48;

const getUserTokenExpiringIn = (seconds: number): string => {
  getUserToken('plugin-user-id', 'plugin-user@example.com'); // sets up the env the key comes from
  return jwt.sign(
    { sub: 'plugin-user-id', email: 'plugin-user@example.com', scope: 'user', iss: 'soilhive-core' },
    getPasswordGrantKey().privateKey,
    {
      algorithm: 'ES256',
      keyid: getPasswordGrantKey().kid,
      expiresIn: seconds,
    },
  );
};

const getUserTokenWith = (claims: object): string => {
  getUserToken('plugin-user-id', 'plugin-user@example.com');
  return jwt.sign(
    { sub: 'plugin-user-id', email: 'plugin-user@example.com', scope: 'user', iss: 'soilhive-core', ...claims },
    getPasswordGrantKey().privateKey,
    {
      algorithm: 'ES256',
      keyid: getPasswordGrantKey().kid,
      expiresIn: 3600,
    },
  );
};
