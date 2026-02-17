import path from 'path';
import { config } from 'dotenv';
import { setupTestEnv } from '../../tests/environment';

export const isJest = () => process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeField = (field: string, removeSpacePlaceholders: boolean = false) => {
  let replaceString = /[^a-z0-9_]/g;
  if (removeSpacePlaceholders) {
    replaceString = /[^a-z]/g;
  }
  return field.toLowerCase().replace('-', '_').replace(replaceString, '');
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
    setupTestEnv();
  } else {
    // Load local .env only outside tests
    config({ path: '.env' });
  }
};
