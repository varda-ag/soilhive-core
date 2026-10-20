import assert from 'assert';
import { createECDH, createHash, createPrivateKey, createPublicKey, hkdfSync, KeyObject } from 'crypto';
import jwt from 'jsonwebtoken';

// Password-grant tokens are ES256 with a key derived from SELF_SIGNING_SECRET (see docs/adr/0060).
// Changing SALT, INFO or the derivation itself rotates the key and logs every password-mode user out.
const SALT = 'soilhive-core';
const INFO = 'password-grant-token-es256';
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

export interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  kid: string;
  use: 'sig';
  alg: 'ES256';
}

export interface Es256Key {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  jwk: PublicJwk;
}

let cached: { secret: string; key: Es256Key } | undefined = undefined;

const deriveScalar = (secret: string, info: string): Buffer => {
  // A scalar outside [1, n-1] is retried with the next counter; odds are about 2^-32
  for (let counter = 0; ; counter++) {
    const scalar = Buffer.from(hkdfSync('sha256', secret, SALT, `${info}:${counter}`, 32));
    const value = BigInt(`0x${scalar.toString('hex')}`);
    if (value > 0n && value < P256_ORDER) {
      return scalar;
    }
  }
};

/**
 * Derives a P-256 key pair from a secret. Each `info` gives an unrelated key, so one secret can
 * back several token kinds without any of them verifying another's tokens.
 */
export const deriveEs256Key = (secret: string, info: string): Es256Key => {
  const scalar = deriveScalar(secret, info);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(scalar);
  const point = ecdh.getPublicKey(); // 0x04 || x || y
  const x = point.subarray(1, 33).toString('base64url');
  const y = point.subarray(33, 65).toString('base64url');

  // RFC 7638 thumbprint: required members only, in lexicographic order
  const kid = createHash('sha256')
    .update(JSON.stringify({ crv: 'P-256', kty: 'EC', x, y }))
    .digest('base64url');

  const privateKey = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: scalar.toString('base64url'), x, y }, format: 'jwk' });
  return {
    kid,
    privateKey,
    publicKey: createPublicKey(privateKey),
    jwk: { kty: 'EC', crv: 'P-256', x, y, kid, use: 'sig', alg: 'ES256' },
  };
};

export const getPasswordGrantKey = (): Es256Key => {
  const secret = process.env.SELF_SIGNING_SECRET;
  assert(secret, 'Self-signing secret is not defined');
  if (cached?.secret !== secret) {
    cached = { secret, key: deriveEs256Key(secret, INFO) };
  }
  return cached.key;
};

export const signPasswordGrantToken = (payload: object, expiresIn: number): string => {
  const { privateKey, kid } = getPasswordGrantKey();
  return jwt.sign(payload, privateKey, { algorithm: 'ES256', keyid: kid, expiresIn });
};
