import path from 'path';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import assert from 'assert';

export const isJest = () => process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeField = (field: string, removeSpacePlaceholders: boolean = false) => {
  let replaceString = /[^a-z0-9_]/g;
  if (removeSpacePlaceholders) {
    replaceString = /[^a-z]/g;
  }
  return field.toLowerCase().replaceAll('-', '_').replace(replaceString, '');
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
  config({ path: '.env' });
};

export const getServerPort = (): number => {
  return Number(process.env.PORT) || 4001;
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
    header: { kid: 'kid' },
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
