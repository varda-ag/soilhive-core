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
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'authorization',
  'between',
  'bigint',
  'binary',
  'bit',
  'boolean',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'collation',
  'column',
  'concurrently',
  'constraint',
  'create',
  'cross',
  'current_catalog',
  'current_date',
  'current_role',
  'current_schema',
  'current_time',
  'current_timestamp',
  'current_user',
  'dec',
  'decimal',
  'default',
  'deferrable',
  'delete',
  'desc',
  'distinct',
  'do',
  'drop',
  'else',
  'end',
  'except',
  'exists',
  'false',
  'fetch',
  'filter',
  'float',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'grant',
  'group',
  'groups',
  'having',
  'if',
  'ilike',
  'in',
  'index',
  'initially',
  'inner',
  'insert',
  'int',
  'integer',
  'intersect',
  'into',
  'is',
  'isnull',
  'join',
  'key',
  'lateral',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'match',
  'natural',
  'not',
  'notnull',
  'null',
  'numeric',
  'of',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'out',
  'outer',
  'over',
  'overlaps',
  'partition',
  'placing',
  'precision',
  'primary',
  'query',
  'range',
  'real',
  'references',
  'returning',
  'right',
  'row',
  'rows',
  'select',
  'set',
  'session_user',
  'similar',
  'smallint',
  'some',
  'symmetric',
  'table',
  'temp',
  'temporary',
  'then',
  'ties',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'update',
  'user',
  'using',
  'values',
  'varchar',
  'variadic',
  'verbose',
  'view',
  'when',
  'where',
  'window',
  'with',
  'without',
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

  // Millisecond precision: file_path is unique, so second-resolution keys made two uploads of
  // the same filename within one second collide as a 409. Uploads are issued in parallel.
  // ':' and '.' are replaced so the key stays a clean path segment on every storage backend.
  const formatted = date.toISOString().slice(0, -1).replace(/[:.]/g, '-');

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

/**
 * Maximum Aggregation Units a soil-statistics job will report on.
 *
 * This is what bounds the output, not the query: the result is a cross product of units ×
 * datasets × soil properties × years × depth intervals stored in a jsonb job-data column
 * (docs/adr/0021). At the default, a run spanning 5 datasets and 15 soil properties is
 * already ~15 000 headline cells, so raising it materially needs the output to move out
 * of job data first.
 */
export const getSoilStatisticsMaxUnits = (): number => {
  return Number(process.env['SOIL_STATISTICS_MAX_UNITS']) || 200;
};

/** Upper bound on breakdown (per year and depth interval) cells before groups are dropped. */
export const getSoilStatisticsMaxCells = (): number => {
  return Number(process.env['SOIL_STATISTICS_MAX_CELLS']) || 200_000;
};

/**
 * Statement timeout for the aggregation queries. Deliberately far above the 60s used on
 * request paths — this is a batch job, not a request — and far below pg-boss's 24h job
 * expiry so a stuck query fails the job rather than occupying a worker for a day.
 */
export const getSoilStatisticsStatementTimeoutMs = (): number => {
  return Number(process.env['SOIL_STATISTICS_STATEMENT_TIMEOUT_MS']) || 30 * 60 * 1000;
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

/**
 * Rounds to 3 decimals, dropping the digits that only cost bytes once a float is
 * serialised into JSON. Via Number() rather than toFixed() so the result stays a number
 * and trailing zeros do not come back ("5.500"); null and undefined pass through so
 * callers can round a nullable statistic without branching.
 */
export function round3<T extends number | null | undefined>(value: T): T {
  return (value === null || value === undefined ? value : Number(value.toFixed(3))) as T;
}
