import assert from 'assert';
import { hkdfSync } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from '../utils/error';

const SIGNED_URL_EXPIRATION_SECONDS = 15 * 60; // 15 minutes

// Download tokens have a key of their own, derived from SELF_SIGNING_SECRET, so neither they nor
// internal-request tokens pass the other's check (docs/adr/0080). Changing SALT or INFO voids the
// download links in use.
const SALT = 'soilhive-core';
const INFO = 'download-link-hs256';
export const DOWNLOAD_TOKEN_KID = 'download-link';

const getDownloadTokenKey = (): Buffer => {
  assert(process.env.SELF_SIGNING_SECRET, 'Missing environment variable: SELF_SIGNING_SECRET');
  return Buffer.from(hkdfSync('sha256', process.env.SELF_SIGNING_SECRET, SALT, INFO, 32));
};

export const createSignedPath = (filePath: string, expiresIn: number = SIGNED_URL_EXPIRATION_SECONDS): string => {
  const token = jwt.sign({ filePath }, getDownloadTokenKey(), { algorithm: 'HS256', keyid: DOWNLOAD_TOKEN_KID, expiresIn });

  const separator = filePath.includes('?') ? '&' : '?';
  return `${filePath}${separator}token=${token}`;
};

export const verifySignedPath = (filePath: string, token: string): void => {
  const key = getDownloadTokenKey();

  try {
    const decoded = jwt.verify(token, key, {
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
