import { Cursor } from '../interfaces/Cursor';
import { ErrorResponse } from './error';
import { StatusCodes } from 'http-status-codes';

export const createCursor = (id: string, column?: string, value?: any): Cursor => {
  if (typeof column !== 'string' || value === undefined) {
    return { id };
  }
  return { column, value, id };
};

export const encodeCursor = (cursor: Cursor): string => {
  const cursorString = JSON.stringify(cursor);
  const base64 = Buffer.from(cursorString).toString('base64');
  return base64;
};

export const decodeCursor = (cursorStr: string): Cursor => {
  try {
    const decoded = Buffer.from(cursorStr, 'base64').toString('utf-8');
    const cursor: Cursor = JSON.parse(decoded);
    return cursor;
  } catch (e) {
    throw new ErrorResponse(`Cursor decoding failure: ${e}`, StatusCodes.BAD_REQUEST);
  }
};
