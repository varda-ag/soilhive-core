import path from "path";
import yaml from "js-yaml";
import SwaggerCli from "@apidevtools/swagger-cli";
import { middleware as OpenApiValidator } from "express-openapi-validator";
import { tokenValidator } from "./tokenValidator";
import FileService from "../services/FileService";

const apiSpecFile = path.join(__dirname, "..", "openapi.yaml");

export const openApiMiddleware = OpenApiValidator({
  apiSpec: apiSpecFile,
  validateRequests: true,
  validateResponses: false,
  // operationHandlers points to "src"
  // "x-eov-operation-handler" will have root at "src" folder
  operationHandlers: path.join(__dirname, ".."),
  validateSecurity: {
    handlers: {
      bearerAuth: tokenValidator,
    },
  },
  fileUploader: {
    // Internally Multer is used for file uploads.
    // Storage destination is configured based on environment variables.
    storage: FileService.getUploadStorageEngine(),
  },
});

export const getSwaggerDocument = async () => {
  const apiBundle = await SwaggerCli.bundle(apiSpecFile, {});
  return yaml.load(apiBundle);
};
