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
  const middlewares = OpenApiValidator({
    apiSpec,
    validateRequests: true,
    validateResponses: false,
    // operationHandlers points to "src"
    // "x-eov-operation-handler" will have root at "src" folder
    operationHandlers: path.join(__dirname, '..'),
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

  // Insert "authMiddleware" before "operationHandlersMiddleware".
  // "authMiddleware" will set req.customData.entitlements based on the "x-entitlements-required" property in the OpenAPI schema of the route.
  // At this point req.openapi.schema and req.customData.token are both set.
  middlewares.splice(middlewares.length - 1, 0, async (req, res, next) => {
    try {
      await authMiddleware(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  return middlewares;
};
