import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';
import { createApp } from '../src/app.js';

const CORE_URL = 'https://api.example/api/v1';
const PLUGIN_ID = 'zones';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let pluginKey: KeyPair;
let otherKey: KeyPair; // a key the core has not published: a user-token key, say
const publishedKeys: JWK[] = [];
let coreReachable = true;
let core: Server;
let backend: Server;
let backendUrl: string;

const listen = (server: Server) =>
  new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  );

const publish = async (key: KeyPair, kid: string) => {
  publishedKeys.push({ ...(await exportJWK(key.publicKey)), kid, alg: 'ES256', use: 'sig' });
};

interface SignOptions {
  key?: KeyPair;
  kid?: string;
  typ?: string;
  expiresIn?: string | number; // a duration, or an absolute epoch in seconds
}

const sign = (claims: JWTPayload = {}, { key = pluginKey, kid = 'plugin-1', typ = 'plugin+jwt', expiresIn = '5m' }: SignOptions = {}) =>
  new SignJWT({ iss: CORE_URL, aud: `plugin:${PLUGIN_ID}`, sub: 'user@example.com', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid, typ })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key.privateKey);

const call = (path: string, init: RequestInit & { token?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  return fetch(`${backendUrl}${path}`, { ...init, headers });
};

beforeAll(async () => {
  pluginKey = await generateKeyPair('ES256');
  otherKey = await generateKeyPair('ES256');
  await publish(pluginKey, 'plugin-1');

  // A fake core: its plugin key set, and a datasets read that echoes the token it got
  core = createServer((req, res) => {
    if (!coreReachable) {
      res.writeHead(502).end();
    } else if (req.url === '/api/v1/.well-known/plugin-jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: publishedKeys }));
    } else if (req.url === '/api/v1/datasets') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ authorization: req.headers.authorization }));
    } else {
      res.writeHead(404).end();
    }
  });
  const coreInternalUrl = `${await listen(core)}/api/v1`;

  const app = createApp({ pluginId: PLUGIN_ID, coreUrl: CORE_URL, coreInternalUrl, port: 0 }, { jwksCooldownMs: 0 });
  backend = createServer(app);
  backendUrl = await listen(backend);
});

afterAll(() => {
  backend.close();
  core.close();
});

afterEach(() => {
  coreReachable = true;
  vi.restoreAllMocks();
});

describe('a Plugin token', () => {
  it('is accepted, and gives the Subject', async () => {
    const res = await call('/api/me', { token: await sign() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subject: 'user@example.com', scopes: [] });
  });

  it('is accepted up to 60 s after it expired, for clock skew', async () => {
    const res = await call('/api/me', { token: await sign({}, { expiresIn: Math.floor(Date.now() / 1000) - 30 }) });
    expect(res.status).toBe(200);
  });

  it.each([
    ['for another plugin', () => sign({ aud: 'plugin:other' })],
    ['from another issuer', () => sign({ iss: 'https://elsewhere.example/api/v1' })],
    ['of another type', () => sign({}, { typ: 'JWT' })],
    ['expired more than 60 s ago', () => sign({}, { expiresIn: Math.floor(Date.now() / 1000) - 120 })],
    ['signed with a key the core never published', () => sign({}, { key: otherKey, kid: 'user-key' })],
    [
      'signed with HS256',
      () =>
        new SignJWT({ iss: CORE_URL, aud: `plugin:${PLUGIN_ID}`, sub: 'x' })
          .setProtectedHeader({ alg: 'HS256', kid: 'plugin-1', typ: 'plugin+jwt' })
          .setExpirationTime('5m')
          .sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length')),
    ],
    ['that is not a JWT', async () => 'not-a-token'],
  ])('is refused when it is %s, with a 401 the browser can read', async (_, token) => {
    const res = await call('/api/me', { token: await token() });
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('is checked against keys fetched again when its kid is new, after a rotation', async () => {
    const rotated = await generateKeyPair('ES256');
    expect((await call('/api/me', { token: await sign() })).status).toBe(200); // the key set is cached now
    await publish(rotated, 'plugin-2');

    const res = await call('/api/me', { token: await sign({}, { key: rotated, kid: 'plugin-2' }) });
    expect(res.status).toBe(200);
  });

  it('is answered 503, not 401, when the core cannot give its keys', async () => {
    coreReachable = false;
    const res = await call('/api/me', { token: await sign({}, { kid: 'never-seen' }) });
    expect(res.status).toBe(503);
  });
});

describe('routes', () => {
  it('lets an anonymous visitor in where no token is needed', async () => {
    const res = await call('/api/public');
    expect(await res.json()).toMatchObject({ signedIn: false });
  });

  it('refuses a bad token even where none is needed, so the host renews it', async () => {
    const res = await call('/api/public', { token: 'not-a-token' });
    expect(res.status).toBe(401);
  });

  it('refuses an anonymous visitor where a token is needed', async () => {
    expect((await call('/api/me')).status).toBe(401);
  });

  it('reads the core with the same token', async () => {
    const token = await sign();
    const res = await call('/api/datasets', { token });
    expect(await res.json()).toEqual({ authorization: `Bearer ${token}` });
  });

  it('turns a user away with a 403, and lets an admin in', async () => {
    expect((await call('/api/admin-only', { token: await sign() })).status).toBe(403);
    expect((await call('/api/admin-only', { token: await sign({ scope: 'super-admin data-admin' }) })).status).toBe(200);
  });

  it('answers a 404 with CORS headers too', async () => {
    const res = await call('/nowhere');
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('CORS', () => {
  it('answers a preflight before any token check', async () => {
    const res = await call('/api/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://host.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-trace',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('authorization,x-trace');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('the request log', () => {
  it('never writes the token or a cookie', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const token = await sign();
    await call('/api/me', { token, headers: { Cookie: 'token=the-user-token' } });

    const written = log.mock.calls.flat().join('\n');
    expect(written).toContain('/api/me');
    expect(written).not.toContain(token);
    expect(written).not.toContain('the-user-token');
  });
});
