import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { NextFunction, Request, Response } from 'express';
import { Logger } from 'typeorm';

const OUTPUT_DIR = '/tmp';
const skip = ['/health', '/ready', '/docs'];

export const isQueryDebugEnabled = () => process.env['DEBUG_QUERY_LOG'] === 'true';

interface QueryDebugStore {
  queries: string[];
}

const requestContext = new AsyncLocalStorage<QueryDebugStore>();

const formatParameter = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (Array.isArray(value)) return `ARRAY[${value.map(formatParameter).join(', ')}]`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

/** Replaces $1, $2, ... placeholders with literal parameter values. */
const inlineParameters = (query: string, parameters?: unknown[]): string => {
  if (!parameters?.length) return query;
  return query.replace(/\$(\d+)/g, (match, digits: string) => {
    const index = Number(digits) - 1;
    return index >= 0 && index < parameters.length ? formatParameter(parameters[index]) : match;
  });
};

/**
 * TypeORM logger that appends every executed query (with parameter values
 * inlined) to the buffer of the request currently in scope. Queries executed
 * outside a request context (jobs, startup, migrations) are ignored.
 */
export class QueryDebugLogger implements Logger {
  logQuery(query: string, parameters?: unknown[]) {
    requestContext.getStore()?.queries.push(`${inlineParameters(query, parameters)};`);
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
    const store = requestContext.getStore();
    if (!store) return;
    const message = error instanceof Error ? error.message : error;
    store.queries.push(`-- ERROR: ${message.replace(/\n/g, '\n-- ')}\n${inlineParameters(query, parameters)};`);
  }

  logQuerySlow() {}
  logSchemaBuild() {}
  logMigration() {}
  log() {}
}

const urlToFilename = (url: string): string => {
  const sanitized = url
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 150);
  return sanitized || 'root';
};

/**
 * When DEBUG_QUERY_LOG=true, collects all DB queries executed during a request
 * and writes them to a .sql file in /tmp, one file per request, named after
 * the request URL (with method and timestamp appended to avoid collisions).
 */
export const queryDebugMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!isQueryDebugEnabled() || skip.some(p => req.path.startsWith(p))) {
    return next();
  }

  const store: QueryDebugStore = { queries: [] };
  const startedAt = new Date();

  res.on('close', () => {
    if (store.queries.length === 0) return;
    const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
    const fileName = `${urlToFilename(req.originalUrl)}_${req.method}_${timestamp}.sql`;
    const header = `-- ${req.method} ${req.originalUrl}\n-- ${startedAt.toISOString()}\n\n`;
    fs.promises.writeFile(path.join(OUTPUT_DIR, fileName), `${header}${store.queries.join('\n\n')}\n`).catch(() => {
      // best-effort debug output; never fail the request over it
    });
  });

  requestContext.run(store, next);
};
