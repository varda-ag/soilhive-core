import cors from 'cors';
import { config } from 'dotenv';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { transactionMiddleware } from './middlewares/transaction';
import { isJest } from './utils/utils';
import { initializeSchema } from './utils/data-source';
import { setupCLI } from './utils/cli';
import { setupTestEnv } from '../tests/environment';
import { initPgBoss } from './services/PgBoss';

if (process.env.NODE_ENV !== 'test') {
  // Load local .env only outside tests
  config({ path: '.env' });
} else {
  setupTestEnv();
}

export const app: Application = express();

export const initApp = async (app: Application) => {
  await setupCLI();

  app.use(
    cors({
      origin: '*',
    }),
  );

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: process.env.JSON_PAYLOAD_LIMIT || undefined }));
  app.use(transactionMiddleware);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(await getSwaggerDocument()));
  app.use(await getOpenApiMiddleware());
  app.use(errorMiddleware);

  if (isJest()) {
    console.log('Running in test mode, not starting server.');
    return;
  }

  await initPgBoss();
  initializeSchema();

  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
};

(async () => {
  await initApp(app);
})();
