import { afterAll, beforeAll, beforeEach, jest } from '@jest/globals';
import http from 'http';
import inspector from 'inspector';
import { setupTestEnv } from './environment';
import { clearDatabase } from './helper';
import { app } from '../src/app';
import { resetEnabledRasterFilterTablesCache } from '../src/data-layer/SoilDataStorage';

if (inspector.url()) {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes timeout when debugger is attached
}

// request(app) wraps the app in http.createServer, listens on [::]:0 and dials 127.0.0.1. On macOS another
// process holding 127.0.0.1:<port> answers instead (random 401/404s). supertest uses an already listening
// server as is, so hand it one bound to 127.0.0.1. keepAliveTimeout 0: no server-side close racing a reused socket.
// http is shared by every test file in a worker: keep the original createServer, never wrap a wrapper.
const httpModule = http as typeof http & { originalCreateServer?: typeof http.createServer };
httpModule.originalCreateServer ??= http.createServer;
const originalCreateServer = httpModule.originalCreateServer;
const appServer = originalCreateServer(app);
appServer.keepAliveTimeout = 0;
http.createServer = ((...args: unknown[]) =>
  args.length === 1 && args[0] === app ? appServer : Reflect.apply(originalCreateServer, http, args)) as typeof http.createServer;

beforeAll(() => new Promise<void>(resolve => appServer.listen(0, '127.0.0.1', resolve)));
afterAll(() => new Promise<void>(resolve => appServer.close(() => resolve())));

beforeEach(async () => {
  // Code to run before each test across all test files
  await clearDatabase();
  // clearDatabase truncates raster_filters; drop the matching in-memory cache too so a
  // value cached while the table was empty does not leak into the next test.
  resetEnabledRasterFilterTablesCache();
  setupTestEnv();
});
