import './utils/logger';
import cors from 'cors';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { loggingMiddleware } from './middlewares/logging';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { transactionMiddleware } from './middlewares/transaction';
import { initPgBoss } from './services/PgBoss';
import ConfigService from './services/ConfigService';
import FileService from './services/FileService';
import { setupCLI } from './utils/cli';
import { initializeSchema, isDBAvailable } from './utils/data-source';
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
  app.use(transactionMiddleware);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(await getSwaggerDocument()));

  app.get('/health', async (_req, res) => {
    const status = await isDBAvailable();
    res.json({ status });
  });

  app.get('/ready', async (_req, res) => {
    const status = await isDBAvailable();
    res.json({ status });
  });

  app.use(await getOpenApiMiddleware());
  app.use(errorMiddleware);

  if (isJest()) {
    // Running in test mode, not starting server
    return;
  }

  await initPgBoss();
  initializeSchema();

  const { storageMode } = ConfigService.getStorageConfig();
  FileService.configureGdal(storageMode);

  const port = getServerPort();
  app.listen(port, () => {
    log.info('Server started', { port });
  });
};

(async () => {
  await initApp(app);
})();
