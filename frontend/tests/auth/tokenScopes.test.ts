import { decodeTokenFromString } from '../../src/auth/tokenScopes';

// helper — base64 encodes a fake JWT payload
const makeToken = (scope: string) => {
  const payload = btoa(JSON.stringify({ scope }));
  return `header.${payload}.signature`;
};

describe('decodeTokenFromString', () => {
  it('returns empty array when token has no matching scopes', () => {
    expect(decodeTokenFromString(makeToken('openid email profile'))).toEqual([]);
  });

  it('returns super-admin role when present in scope', () => {
    expect(decodeTokenFromString(makeToken('openid email super-admin'))).toEqual(['super-admin']);
  });

  it('returns data-admin role when present in scope', () => {
    expect(decodeTokenFromString(makeToken('openid email data-admin'))).toEqual(['data-admin']);
  });

  it('returns multiple roles when both present in scope', () => {
    expect(decodeTokenFromString(makeToken('openid super-admin data-admin'))).toEqual(['super-admin', 'data-admin']);
  });

  it('is case insensitive', () => {
    expect(decodeTokenFromString(makeToken('SUPER-ADMIN DATA-ADMIN'))).toEqual(['super-admin', 'data-admin']);
  });

  it('returns empty array when token is malformed', () => {
    expect(decodeTokenFromString('not-a-valid-jwt')).toEqual([]);
  });
});
