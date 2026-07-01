import path from 'path';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import assert from 'assert';
import { TokenScopes } from '../types/enums';

export const isJest = () => process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const RESERVED_KEYWORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'authorization', 'between', 'bigint', 'binary', 'bit', 'boolean', 'both',
  'case', 'cast', 'check', 'collate', 'collation', 'column', 'concurrently',
  'constraint', 'create', 'cross', 'current_catalog', 'current_date',
  'current_role', 'current_schema', 'current_time', 'current_timestamp',
  'current_user', 'dec', 'decimal', 'default', 'deferrable', 'delete', 'desc',
  'distinct', 'do', 'drop', 'else', 'end', 'except', 'exists', 'false', 'fetch',
  'filter', 'float', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
  'group', 'groups', 'having', 'if', 'ilike', 'in', 'index', 'initially',
  'inner', 'insert', 'int', 'integer', 'intersect', 'into', 'is', 'isnull',
  'join', 'key', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
  'localtimestamp', 'match', 'natural', 'not', 'notnull', 'null', 'numeric',
  'of', 'offset', 'on', 'only', 'or', 'order', 'out', 'outer', 'over',
  'overlaps', 'partition', 'placing', 'precision', 'primary', 'query', 'range',
  'real', 'references', 'returning', 'right', 'row', 'rows', 'select', 'set',
  'session_user', 'similar', 'smallint', 'some', 'symmetric', 'table', 'temp',
  'temporary', 'then', 'ties', 'to', 'trailing', 'true', 'union', 'unique',
  'update', 'user', 'using', 'values', 'varchar', 'variadic', 'verbose', 'view',
  'when', 'where', 'window', 'with', 'without',
]);

export const sanitizeField = (field: string, removeSpacePlaceholders: boolean = false) => {
  let replaceString = /[^a-z0-9_]/g;
  if (removeSpacePlaceholders) {
    replaceString = /[^a-z]/g;
  }
  let result = field.toLowerCase().replaceAll('-', '_').replace(replaceString, '');
  result = result.replace(/^_+/, '');
  result = result.replace(/^[0-9]+/, '');
  if (RESERVED_KEYWORDS.has(result)) {
    result = `${result}_col`;
  }
  return result;
};

export const sanitizeFilename = (originalName: string): string => {
  const baseName = path.basename(originalName).trim();
  // Remove special characters
  let safeName = baseName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  // Collapse multiple underscores
  safeName = safeName.replace(/_+/g, '_');
  return safeName;
};

export const buildDatedFileKey = (filename: string, date: Date = new Date()): string => {
  const safeName = sanitizeFilename(filename);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');

  const formatted = date.toISOString().split('.')[0]!.replace(/:/g, '-');

  return `${year}/${month}/${formatted}_${safeName}`;
};

export const setupEnv = () => {
  if (isJest()) {
    // Tests have a custom environment
    return;
  }
  // Load local .env only outside tests
  config({ path: '.env', quiet: true });
};

export const getServerPort = (): number => {
  return Number(process.env.PORT) || 4001;
};

export const getExportBatchSize = (): number => {
  return Number(process.env.EXPORT_BATCH_SIZE) || 100;
};

export const getJobLocalConcurrency = (): number => {
  return Number(process.env.JOB_LOCAL_CONCURRENCY) || 3;
};

export const getJobGroupConcurrency = (): number => {
  return Number(process.env.JOB_GROUP_CONCURRENCY) || 8;
};

export const getLoopbackUrl = (): string => {
  return process.env.LOOPBACK_URL || `http://localhost:${getServerPort()}`;
};

export const getRawTableName = (fileId: string): string => {
  return `file_${sanitizeField(fileId)}_raw`;
};

export const signToken = (payload: string | object | Buffer, expiresIn?: number, header?: any) => {
  assert(process.env.SELF_SIGNING_SECRET, 'Self-signing secret is not defined');
  let signOpts: any = {
    algorithm: 'HS256',
    header: { kid: TokenScopes.INTERNAL_REQUEST },
  };
  if (expiresIn) {
    signOpts = { ...signOpts, expiresIn };
  }
  if (header) {
    signOpts = { ...signOpts, header };
  }
  const token = jwt.sign(payload, process.env.SELF_SIGNING_SECRET, signOpts);
  return token;
};

export const replaceExtension = (filePath: string, newExt: string): string => {
  const parsed = path.parse(filePath);
  // path.format ignores `ext` if `base` is present, so remove base
  return path.format({ ...parsed, base: undefined, ext: newExt.startsWith('.') ? newExt : `.${newExt}` });
};

// For dates/depths: treat null as "no data in this geometry" — skip it when a value exists,
// return null only when both sides have no data (matches SQL MIN/MAX aggregate behaviour).
export const mergeMin = (a: string | null, b: string | null): string | null => {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
};
export const mergeMax = (a: string | null, b: string | null): string | null => {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
};
