import { describe, it, expect, beforeEach } from '@jest/globals';
import { createHash, createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';
import { getPasswordGrantKey, signPasswordGrantToken } from '../../src/utils/password-grant-key';

describe('password-grant-key', () => {
  beforeEach(() => {
    process.env.SELF_SIGNING_SECRET = 'put-any-random-string-here';
  });

  it('derives a fixed key from the secret', () => {
    // Pinned: any change to the derivation rotates the key and logs every password-mode user out
    expect(getPasswordGrantKey().jwk).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: 'gIBF2QoLjbH4-bKndmYdkYZCaPBYeBN_3KH2VXnh8Bc',
      y: 'FvcXPyRtTyNm-lBytrIbUsnAuQoBVUJIvGGHYbCnYe0',
      kid: 'iel_NX15_vG3lGtiZSuUd0REdX5WwVzJjBjTYbBJy0I',
      use: 'sig',
      alg: 'ES256',
    });
  });

  it('derives a different key from a different secret', () => {
    const { kid } = getPasswordGrantKey();
    process.env.SELF_SIGNING_SECRET = 'another-secret';
    expect(getPasswordGrantKey().kid).not.toBe(kid);
  });

  it('uses the RFC 7638 thumbprint as kid', () => {
    const { jwk } = getPasswordGrantKey();
    const thumbprint = createHash('sha256').update(`{"crv":"P-256","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`).digest('base64url');
    expect(jwk.kid).toBe(thumbprint);
  });

  it('signs ES256 tokens that the published JWK verifies', () => {
    const { jwk } = getPasswordGrantKey();
    const token = signPasswordGrantToken({ sub: 'u1' }, 60);

    expect(jwt.decode(token, { complete: true })!.header).toMatchObject({ alg: 'ES256', kid: jwk.kid });
    expect(jwt.verify(token, createPublicKey({ key: { ...jwk }, format: 'jwk' }), { algorithms: ['ES256'] })).toMatchObject({
      sub: 'u1',
    });
  });

  it('throws when the secret is not set', () => {
    delete process.env.SELF_SIGNING_SECRET;
    expect(() => getPasswordGrantKey()).toThrow('Self-signing secret is not defined');
  });
});
