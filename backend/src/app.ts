import './utils/logger';
import cors from 'cors';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { loggingMiddleware } from './middlewares/logging';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { transactionMiddleware } from './middlewares/transaction';
import { uploadSizeLimit } from './middlewares/uploadSizeLimit';
import { initPgBoss } from './services/PgBoss';
import { setupCLI } from './utils/cli';
import { cacheBypassMiddleware, isCacheBypassEnabled } from './utils/cache-bypass';
import { startCacheEpochWatcher } from './utils/cache-epoch';
import { getEntityManager, initializeSchema } from './utils/data-source';
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

export const initApp = async (app: Application) => {
  await setupCLI();

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
  app.use(
    cors({
      origin,
      credentials: true, // Allow cookies/auth headers
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400, // 24 hours
    }),
  );

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

  await initPgBoss();
  await initializeSchema();
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
  server.requestTimeout = Number(process.env['REQUEST_TIMEOUT_MS']) || 30 * 60 * 1000;
};

(async () => {
  await initApp(app);
  if (isJest()) _resolveReady!();
})();
