import './utils/logger';
import cors from 'cors';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { loggingMiddleware } from './middlewares/logging';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { transactionMiddleware } from './middlewares/transaction';
import { initPgBoss } from './services/PgBoss';
import { setupCLI } from './utils/cli';
import { getEntityManager, initializeSchema } from './utils/data-source';
import { log } from './utils/logger';
import { getServerPort, isJest, setupEnv } from './utils/utils';

setupEnv();

export const app: Application = express();

export const initApp = async (app: Application) => {
  await setupCLI();

  const origin = (process.env.CORS_ORIGINS || 'http://localhost,http://localhost:3000').split(',').map(o => o.trim());

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
  initializeSchema();

  const port = getServerPort();
  app.listen(port, () => {
    log.info('Server started', { port });
  });
};

(async () => {
  await initApp(app);
})();
