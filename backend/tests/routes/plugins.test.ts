import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import http, { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { gzipSync } from 'zlib';
import request from 'supertest';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { getUserToken } from '../helper';

const PLUGIN_ID = 'zones-plugin';
const SECRET = 'zones-plugin-secret-0123456789abcdef';

type Received = { method: string; url: string; headers: IncomingHttpHeaders; body: string };

// Stands in for a Plugin Backend: records every call it gets, and answers with `respond`.
let received: Received[] = [];
let respond: (req: IncomingMessage, res: ServerResponse) => void;
const echo = (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(StatusCodes.OK, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ path: req.url }));
};

const pluginBackend = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) chunks.push(chunk as Buffer);
  } catch {
    return; // the core backend cut the body off
  }
  received.push({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() });
  respond(req, res);
});

// supertest resolves dot segments before it sends a path, and always sends a Content-Length, so these
// go out as written: the path as is, the body chunked. The server is the one tests/jest.beforeEach.ts
// already started for app.
const sendRaw = (path: string, { method = 'GET', headers = {} as Record<string, string>, chunks = [] as string[] } = {}) =>
  new Promise<number>((resolve, reject) => {
    const { port } = http.createServer(app).address() as AddressInfo;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });

const listen = (server: http.Server) =>
  new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

describe('/plugins/{pluginId}/ forwards to the Plugin Backend registered for pluginId', () => {
  let port: number;
  let closedPort: number;
  let token: string;
  const originalMaxUploadSizeMB = process.env.MAX_UPLOAD_SIZE_MB;

  beforeAll(async () => {
    // Not in the test: getUserToken resets the environment, Plugin Backends included.
    token = getUserToken('user-sub', 'user@example.com');
    port = await listen(pluginBackend);
    // A port nothing listens on any more
    const closed = http.createServer();
    closedPort = await listen(closed);
    await new Promise(resolve => closed.close(resolve));
  });

  afterAll(() => new Promise(resolve => pluginBackend.close(resolve)));

  beforeEach(() => {
    received = [];
    respond = echo;
    process.env.PLUGIN_BACKENDS = JSON.stringify({
      [PLUGIN_ID]: `http://127.0.0.1:${port}/api`,
      'gone-plugin': `http://127.0.0.1:${closedPort}`,
    });
    process.env.PLUGIN_BACKEND_SECRETS = JSON.stringify({ [PLUGIN_ID]: SECRET, 'gone-plugin': SECRET });
  });

  afterEach(() => {
    if (originalMaxUploadSizeMB === undefined) delete process.env.MAX_UPLOAD_SIZE_MB;
    else process.env.MAX_UPLOAD_SIZE_MB = originalMaxUploadSizeMB;
  });

  it.each(['/api/v1/plugins', '/plugins'])('forwards %s/{pluginId}/{path} under the base path, with the query string', async prefix => {
    const res = await request(app).get(`${prefix}/${PLUGIN_ID}/zones/north?bbox=1&bbox=2.5&q=a+b`);

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ path: '/api/zones/north?bbox=1&bbox=2.5&q=a+b' });
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(received).toHaveLength(1);
    expect(received[0]!.method).toBe('GET');
  });

  it("sends this deployment's secret and the caller's Subject, never the caller's token or cookies", async () => {
    const res = await request(app)
      .get(`/api/v1/plugins/${PLUGIN_ID}/zones`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', 'session=abc')
      .set('X-SoilHive-Subject', 'admin@example.com')
      .set('X-Requested-With', 'zones-ui');

    expect(res.statusCode).toBe(StatusCodes.OK);
    const { headers } = received[0]!;
    expect(headers['authorization']).toBe(`Bearer ${SECRET}`);
    expect(headers['x-soilhive-subject']).toBe('user@example.com');
    expect(headers['cookie']).toBeUndefined();
    expect(headers['x-requested-with']).toBe('zones-ui');
    expect(JSON.stringify(headers)).not.toContain(token);
  });

  it('forwards an anonymous call with no Subject, whatever the caller claims', async () => {
    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones`).set('X-SoilHive-Subject', 'admin@example.com');

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(received[0]!.headers['authorization']).toBe(`Bearer ${SECRET}`);
    expect(received[0]!.headers['x-soilhive-subject']).toBeUndefined();
  });

  it('answers 401 itself for an invalid token, so the host renews it, and calls nothing', async () => {
    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones`).set('Authorization', 'Bearer not-a-token');

    expect(res.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    expect(received).toHaveLength(0);
  });

  it('answers 404 for a plugin with no registered Plugin Backend', async () => {
    const res = await request(app).get('/api/v1/plugins/other-plugin/zones');

    expect(res.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(res.body.detail).toBe('No Plugin Backend is registered for plugin "other-plugin"');
  });

  it.each(['/..', '/../admin', '/%2e%2e/admin', '/zones%2F..%2F..%2Fadmin', '/zones%5C..%5C..%5Cadmin'])(
    'refuses %s, which leaves the base path, and calls nothing',
    async path => {
      expect(await sendRaw(`/api/v1/plugins/${PLUGIN_ID}${path}`)).toBe(StatusCodes.BAD_REQUEST);
      expect(received).toHaveLength(0);
    },
  );

  it('streams a JSON body through as it was sent', async () => {
    const res = await request(app)
      .post(`/api/v1/plugins/${PLUGIN_ID}/zones`)
      .set('Content-Type', 'application/json')
      .send('{"name":"North field","area":12.5}');

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(received[0]!.method).toBe('POST');
    expect(received[0]!.headers['content-type']).toBe('application/json');
    expect(received[0]!.body).toBe('{"name":"North field","area":12.5}');
  });

  it('streams a multipart body through, left alone by the core backend', async () => {
    const res = await request(app)
      .put(`/api/v1/plugins/${PLUGIN_ID}/zones/north/shape`)
      .attach('file', Buffer.from('POLYGON((0 0,1 0,1 1,0 0))'), 'north.wkt');

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(received[0]!.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(received[0]!.body).toContain('filename="north.wkt"');
    expect(received[0]!.body).toContain('POLYGON((0 0,1 0,1 1,0 0))');
  });

  it('refuses a body over the upload limit and calls nothing', async () => {
    process.env.MAX_UPLOAD_SIZE_MB = String(1 / 1024); // 1 KiB

    const res = await request(app).post(`/api/v1/plugins/${PLUGIN_ID}/zones`).set('Content-Type', 'text/plain').send('x'.repeat(2048));

    expect(res.statusCode).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(received).toHaveLength(0);
  });

  it('cuts off a chunked body once it passes the upload limit', async () => {
    process.env.MAX_UPLOAD_SIZE_MB = String(1 / 1024); // 1 KiB

    const status = await sendRaw(`/api/v1/plugins/${PLUGIN_ID}/zones`, { method: 'POST', chunks: ['x'.repeat(800), 'x'.repeat(800)] });

    expect(status).toBe(StatusCodes.REQUEST_TOO_LONG);
    expect(received).toHaveLength(0);
  });

  it("turns the Plugin Backend's 401 into a 502, so the host keeps the user's token", async () => {
    respond = (_req, res) => {
      res.writeHead(StatusCodes.UNAUTHORIZED, { 'Content-Type': 'application/json' });
      res.end('{"detail":"Bad secret"}');
    };

    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones`);

    expect(res.statusCode).toBe(StatusCodes.BAD_GATEWAY);
  });

  it("passes the Plugin Backend's other errors through, body included", async () => {
    respond = (_req, res) => {
      res.writeHead(StatusCodes.FORBIDDEN, { 'Content-Type': 'application/json' });
      res.end('{"detail":"Sign in to see zones"}');
    };

    const res = await request(app).delete(`/api/v1/plugins/${PLUGIN_ID}/zones/north`);

    expect(res.statusCode).toBe(StatusCodes.FORBIDDEN);
    expect(res.body).toEqual({ detail: 'Sign in to see zones' });
    expect(received[0]!.method).toBe('DELETE');
  });

  it('drops cookies, CORS and encoding headers from the response, and keeps browsers from sniffing or running it', async () => {
    respond = (_req, res) => {
      res.writeHead(StatusCodes.OK, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Set-Cookie': ['session=plugin', 'tracker=1'],
        'Access-Control-Allow-Origin': '*',
        ETag: '"v1"',
      });
      res.end(gzipSync('{"zones":[]}'));
    };

    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones`);

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ zones: [] });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['etag']).toBe('"v1"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe('sandbox');
  });

  it('hands a redirect back to the caller instead of following it', async () => {
    respond = (_req, res) => {
      res.writeHead(StatusCodes.MOVED_TEMPORARILY, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    };

    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones/export`).redirects(0);

    expect(res.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY);
    expect(res.headers['location']).toBe('http://169.254.169.254/latest/meta-data/');
    expect(received).toHaveLength(1);
  });

  it('answers 502 when the Plugin Backend cannot be reached', async () => {
    const res = await request(app).get('/api/v1/plugins/gone-plugin/zones');

    expect(res.statusCode).toBe(StatusCodes.BAD_GATEWAY);
  });

  it('answers 504 when the Plugin Backend does not answer in time', async () => {
    process.env.PLUGIN_BACKEND_TIMEOUT_MS = '100';
    respond = (req, res) => {
      const timer = setTimeout(() => echo(req, res), 1000);
      res.on('close', () => clearTimeout(timer));
    };

    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones`);

    expect(res.statusCode).toBe(StatusCodes.GATEWAY_TIMEOUT);
  });

  it('lets a response that has started take longer than the timeout', async () => {
    process.env.PLUGIN_BACKEND_TIMEOUT_MS = '100';
    respond = (_req, res) => {
      res.writeHead(StatusCodes.OK, { 'Content-Type': 'text/csv' });
      res.write('id,name\n');
      setTimeout(() => res.end('1,North field\n'), 300);
    };

    const res = await request(app).get(`/api/v1/plugins/${PLUGIN_ID}/zones.csv`);

    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.text).toBe('id,name\n1,North field\n');
  });

  it('sends no Content-Length without a body to go with it', async () => {
    const status = await sendRaw(`/api/v1/plugins/${PLUGIN_ID}/zones`, { headers: { 'Content-Length': '5' } });

    expect(status).toBe(StatusCodes.OK);
    expect(received[0]!.headers['content-length']).toBeUndefined();
  });
});
