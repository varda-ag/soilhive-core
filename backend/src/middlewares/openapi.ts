import { readFile } from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { middleware as OpenApiValidator } from 'express-openapi-validator';
import { tokenValidator } from './tokenValidator';
import FileService from '../services/FileService';
import { authMiddleware } from './auth';
import ConfigService from '../services/ConfigService';

// Placeholder that lets runner calls reach their 501 controller: the validator answers 500 for a
// scheme with no handler, and for any 501 a handler throws. Must check the runner assertion
// before any runner route is built (docs/adr/0078).
const runnerAuth = () => true;

// Spec files with paths of their own, merged in here rather than listed in openapi.yaml. Each stays
// complete on its own, so a client can be generated from it (docs/adr/0078).
const PATH_FRAGMENTS = ['model-runners.yaml'];
const MAIN_REF = '../src/openapi.yaml#';

type Spec = { paths: Record<string, unknown>; components?: Record<string, Record<string, unknown>> };

const readSpec = async (file: string): Promise<Spec> => yaml.load(await readFile(file, 'utf8')) as Spec;

const toInternalRefs = (node: unknown): void => {
  if (node && typeof node === 'object') {
    const ref = (node as { $ref?: unknown }).$ref;
    if (typeof ref === 'string' && ref.startsWith(MAIN_REF)) {
      (node as { $ref: string }).$ref = `#${ref.slice(MAIN_REF.length)}`;
    }
    Object.values(node).forEach(toInternalRefs);
  }
};

// A name in both files is a mistake, unless the fragment's entry only points at openapi.yaml's.
export const mergeFragment = (main: Spec, fragment: Spec, name: string): void => {
  toInternalRefs(fragment);
  for (const [route, item] of Object.entries(fragment.paths)) {
    if (main.paths[route] !== undefined) {
      throw new Error(`${name}: ${route} is also in openapi.yaml`);
    }
    main.paths[route] = item;
  }
  for (const [section, entries] of Object.entries(fragment.components ?? {})) {
    const target = ((main.components ??= {})[section] ??= {});
    for (const [key, value] of Object.entries(entries)) {
      if (target[key] === undefined) {
        target[key] = value;
      } else if ((value as { $ref?: unknown }).$ref !== `#/components/${section}/${key}`) {
        throw new Error(`${name}: components.${section}.${key} is also in openapi.yaml`);
      }
    }
  }
};

let cachedSwaggerDocument: any = undefined;

export const getSwaggerDocument = async () => {
  if (!cachedSwaggerDocument) {
    const apiSpecFile = path.join(__dirname, '..', 'openapi.yaml');
    const spec = await readSpec(apiSpecFile);
    for (const fragment of PATH_FRAGMENTS) {
      // At ../src/, as openapi.yaml's own refs, from src/ and from dist/ alike
      mergeFragment(spec, await readSpec(path.join(__dirname, '..', '..', 'src', fragment)), fragment);
    }
    // Bundled from openapi.yaml's path, so every relative ref resolves as before
    cachedSwaggerDocument = await SwaggerParser.bundle(apiSpecFile, spec as any, { dereference: { circular: true } });
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
        runnerAuth,
      },
    },
    fileUploader: {
      // Internally Multer is used for file uploads.
      // Storage destination is configured based on environment variables.
      storage: FileService.getUploadStorageEngine(),
      // Authoritative size check for both multipart routes (POST /files, POST /frontend/logo -
      // see ADR 0029 for why they share one limit). Stops those uploads that don't specify
      // content-length and are not caught by the uploadSizeLimit middleware (e.g. chunked transfer-encoding).
      limits: { fileSize: ConfigService.getMaxUploadSizeBytes() },
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
