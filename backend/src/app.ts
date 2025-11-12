import "dotenv/config";
import express from "express";
import cors from 'cors';
import swaggerUi from "swagger-ui-express";
import { transactionMiddleware } from "./middlewares/transaction";
import { errorMiddleware } from "./middlewares/error";
import { openApiMiddleware, swaggerDocument } from "./middlewares/openapi";
import { isJest } from "./utils/utils";
import { runConditionalMigrations } from "./utils/data-source";

export const app = express();
app.use(
  cors({
    origin: '*',
  }),
);
app.use(express.json());
app.use(transactionMiddleware);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(openApiMiddleware);
app.use(errorMiddleware);

(async () => {
  // Running migrations here to initialize DB tables only once
  await runConditionalMigrations();

  if (isJest()) {
    console.log("Running in test mode, not starting server.");
    return;
  }

  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
})();
