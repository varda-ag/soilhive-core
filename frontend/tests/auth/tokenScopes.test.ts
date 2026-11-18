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

  // As identity providers send it: base64url, no padding. "~~~???" puts a ~ and a ? at every
  // position of a base64 group, so the payload is sure to hold both - and _.
  const makeBase64UrlToken = (claims: object) => {
    const payload = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `header.${payload}.signature`;
  };

  it('reads a base64url payload holding - and _', () => {
    const token = makeBase64UrlToken({ note: '~~~???', scope: 'openid super-admin' });
    expect(token.split('.')[1]).toMatch(/-.*_|_.*-/);
    expect(decodeTokenFromString(token)).toEqual(['super-admin']);
  });

  it('reads a scope sent as an array', () => {
    expect(decodeTokenFromString(makeBase64UrlToken({ scope: ['openid', 'data-admin'] }))).toEqual(['data-admin']);
  });

  it('ignores a scope that is neither a string nor an array', () => {
    expect(decodeTokenFromString(makeBase64UrlToken({ scope: 42 }))).toEqual([]);
  });
});
