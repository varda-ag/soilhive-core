import './utils/logger';
import cors from 'cors';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { loggingMiddleware } from './middlewares/logging';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { pluginProxy } from './middlewares/pluginProxy';
import { transactionMiddleware } from './middlewares/transaction';
import { uploadSizeLimit } from './middlewares/uploadSizeLimit';
import ConfigService from './services/ConfigService';
import { initPgBoss } from './services/PgBoss';
import { setupCLI } from './utils/cli';
import { cacheBypassMiddleware, isCacheBypassEnabled } from './utils/cache-bypass';
import { startCacheEpochWatcher } from './utils/cache-epoch';
import { getEntityManager, initializeSchema } from './utils/data-source';
import { getErrorMessage } from './utils/error';
import { log } from './utils/logger';
import { isQueryDebugEnabled, queryDebugMiddleware } from './utils/query-debug';
import { getServerPort, isJest, setupEnv } from './utils/utils';
import { syncVocabularies } from './scripts/syncVocabularies';

setupEnv();

export const app: Application = express();

// Defers every request until initApp completes, so no request races the
// async middleware registration (e.g. getOpenApiMiddleware).
let _resolveReady: () => void;
const ready = new Promise<void>(res => {
  _resolveReady = res;
});
if (isJest()) {
  app.use((_req, _res, next) => ready.then(next));
}

const PLUGIN_ROUTES = ['/api/v1/plugins/:pluginId', '/plugins/:pluginId'];

export const initApp = async (app: Application) => {
  await setupCLI();
  // A malformed PLUGIN_BACKENDS or PLUGIN_BACKEND_SECRETS shows in the log at start, rather than on
  // the first plugin call. It does not stop the start: only the plugin route answers 503, and the
  // rest of the core backend keeps serving (docs/adr/0062).
  try {
    ConfigService.getPluginBackends();
  } catch (error) {
    log.error('Plugin Backends are misconfigured: every /plugins/ call will answer 503', { error: getErrorMessage(error) });
  }

  const origin = (process.env.CORS_ORIGINS || 'http://localhost,http://localhost:3000').split(',').map(o => o.trim());

  if (isQueryDebugEnabled()) {
    app.use(queryDebugMiddleware);
  }
  if (isCacheBypassEnabled()) {
    // Before /health and /ready, so a client's echo preflight can use the
    // cheapest endpoint here (docs/adr/0028).
    app.use(cacheBypassMiddleware);
  }
  app.use(loggingMiddleware);
  const corsOptions = {
    origin,
    credentials: true, // Allow cookies/auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 86400, // 24 hours
  };
  // A plugin may send its own headers to its Plugin Backend (usePluginApi's headers option), so its
  // route allows whichever headers a page from an allowed origin asks for. The proxy still drops
  // the ones that are not the plugin's to set.
  app.use(PLUGIN_ROUTES, cors(corsOptions));
  app.use(cors({ ...corsOptions, allowedHeaders: ['Content-Type', 'Authorization'] }));

  // Ahead of the body parsers, so that a plugin's request body streams through to its Plugin Backend untouched.
  app.use(PLUGIN_ROUTES, pluginProxy);

  app.use(uploadSizeLimit);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: process.env.JSON_PAYLOAD_LIMIT || undefined }));

  app.get('/health', (_req, res) => {
    res.json({ status: true });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const entityManager = await getEntityManager();
      const results = await entityManager.query('SELECT 1');
      if (results.length === 1) {
        res.json({ status: true });
      } else {
        res.status(503).json({ status: false });
      }
    } catch {
      res.status(503).json({ status: false });
    }
  });

  // Important: transaction middleware is active from this point and should be before errorMiddleware
  app.use(transactionMiddleware);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(await getSwaggerDocument()));

  app.use(await getOpenApiMiddleware());
  app.use(errorMiddleware);

  if (isJest()) {
    // Running in test mode, not starting server
    return;
  }

  await initializeSchema();
  await initPgBoss();
  try {
    await syncVocabularies();
  } catch (error) {
    log.error('Vocabulary sync failed at startup', { error: error instanceof Error ? error.message : String(error) });
  }
  await startCacheEpochWatcher();

  const port = getServerPort();
  const server = app.listen(port, () => {
    log.info('Server started', { port });
  });
  // Node defaults to requestTimeout = 5 minutes (HTTP 408 beyond that)
  server.requestTimeout = Number(process.env['REQUEST_TIMEOUT_MS']) || 720 * 60 * 1000;
};

(async () => {
  await initApp(app);
  if (isJest()) _resolveReady!();
})();
