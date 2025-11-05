import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { middleware as OpenApiValidator } from "express-openapi-validator";

const apiSpecFile = path.join(__dirname, "..", "openapi.yaml");

export const openApiMiddleware = OpenApiValidator({
  apiSpec: apiSpecFile,
  validateRequests: true,
  validateResponses: false,
  // operationHandlers points to "src"
  // "x-eov-operation-handler" will reference "controllers" folder
  operationHandlers: path.join(__dirname, ".."),
});

export const swaggerDocument = yaml.load(readFileSync(apiSpecFile, "utf8"));
