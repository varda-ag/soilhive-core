import path from 'path';
import yaml from 'js-yaml';
import SwaggerCli from '@apidevtools/swagger-cli';
import { middleware as OpenApiValidator } from 'express-openapi-validator';
import { tokenValidator } from './tokenValidator';
import FileService from '../services/FileService';
import { authMiddleware } from './auth';

let cachedSwaggerDocument = undefined;

export const getSwaggerDocument = async () => {
  if (!cachedSwaggerDocument) {
    const apiSpecFile = path.join(__dirname, '..', 'openapi.yaml');
    const apiBundle = await SwaggerCli.bundle(apiSpecFile, {});
    cachedSwaggerDocument = yaml.load(apiBundle);
  }
  return cachedSwaggerDocument!;
};

export const getOpenApiMiddleware = async () => {
  const apiSpec = await getSwaggerDocument();
  return OpenApiValidator({
    apiSpec,
    validateRequests: true,
    validateResponses: false,
    // operationHandlers points to "src"
    // "x-eov-operation-handler" will have root at "src" folder
    operationHandlers: path.join(__dirname, '..'),
    validateSecurity: {
      handlers: {
        bearerAuth: async (req, scopes) => {
          const result = await tokenValidator(req, scopes);
          if (result) await authMiddleware(req); // Get entitlements
          return result;
        },
      },
    },
    fileUploader: {
      // Internally Multer is used for file uploads.
      // Storage destination is configured based on environment variables.
      storage: FileService.getUploadStorageEngine(),
    },
  });
};
