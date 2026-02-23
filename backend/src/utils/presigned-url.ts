import assert from 'assert';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from '../utils/error';

const SIGNED_URL_EXPIRATION_SECONDS = 15 * 60; // 15 minutes

export const createSignedPath = (filePath: string, expiresIn: number = SIGNED_URL_EXPIRATION_SECONDS): string => {
  assert(process.env.SELF_SIGNING_SECRET, 'Missing environment variable: SELF_SIGNING_SECRET');

  const token = jwt.sign({ filePath }, process.env.SELF_SIGNING_SECRET, {
    expiresIn,
    algorithm: 'HS256',
  });

  const separator = filePath.includes('?') ? '&' : '?';
  return `${filePath}${separator}token=${token}`;
};

export const verifySignedPath = (filePath: string, token: string): void => {
  assert(process.env.SELF_SIGNING_SECRET, 'Missing environment variable: SELF_SIGNING_SECRET');

  try {
    const decoded = jwt.verify(token, process.env.SELF_SIGNING_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    if (decoded['filePath'] !== filePath) {
      throw new ErrorResponse('Invalid download token', StatusCodes.UNAUTHORIZED); // Ensure the token is for the correct file
    }
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new ErrorResponse('Download link has expired', StatusCodes.GONE);
    }
    throw new ErrorResponse('Invalid download token', StatusCodes.UNAUTHORIZED);
  }
};
