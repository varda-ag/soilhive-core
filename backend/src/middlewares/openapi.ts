import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { middleware as OpenApiValidator } from "express-openapi-validator";
import { tokenValidator } from "./tokenValidator";

const apiSpecFile = path.join(__dirname, "..", "openapi.yaml");

export const openApiMiddleware = OpenApiValidator({
  apiSpec: apiSpecFile,
  validateRequests: true,
  validateResponses: false,

  // Need to ignore file paths for upload/download endpoints
  // To avoid multer validation conflicts ("Unexpected end of form" error)
  ignorePaths: /^\/files\/.*/,

  // operationHandlers points to "src"
  // "x-eov-operation-handler" will have root at "src" folder
  operationHandlers: path.join(__dirname, ".."),
  validateSecurity: {
    handlers: {
      bearerAuth: tokenValidator,
    },
  },
});

export const swaggerDocument = yaml.load(readFileSync(apiSpecFile, "utf8"));
