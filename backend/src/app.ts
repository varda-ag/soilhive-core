import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { transactionMiddleware } from "./middlewares/transaction";
import { errorMiddleware } from "./middlewares/error";
import { openApiMiddleware, swaggerDocument } from "./middlewares/openapi";
import { isJest } from "./utils/utils";

export const app = express();
app.use(express.json());
app.use(transactionMiddleware);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(openApiMiddleware);
app.use(errorMiddleware);

if (isJest()) {
  console.log("Running in test mode, not starting server.");
} else {
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}
