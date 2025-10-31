import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { middleware as OpenApiValidator } from "express-openapi-validator";

const apiSpecFile = path.join(__dirname, "..", "openapi.yaml");

export const openApiMiddleware = OpenApiValidator({
  apiSpec: apiSpecFile,
  validateRequests: true,
  validateResponses: false,
  operationHandlers: path.join(__dirname, ".."), // This points to "controllers" folder
});

export const swaggerDocument = yaml.load(readFileSync(apiSpecFile, "utf8"));
