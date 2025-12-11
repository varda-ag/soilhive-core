import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { errorMiddleware } from './middlewares/error';
import { getOpenApiMiddleware, getSwaggerDocument } from './middlewares/openapi';
import { transactionMiddleware } from './middlewares/transaction';
import { isJest } from './utils/utils';
import { initializeSchema } from './utils/data-source';

export const app = express();

(async () => {
  app.use(
    cors({
      origin: '*',
    }),
  );

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(transactionMiddleware);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(await getSwaggerDocument()));
  app.use(await getOpenApiMiddleware());
  app.use(errorMiddleware);

  if (isJest()) {
    console.log('Running in test mode, not starting server.');
    return;
  }

  initializeSchema();

  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
})();
