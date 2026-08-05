import { getEmailFromAccessToken } from '../../src/auth/tokenClaims';

// helper — base64url encodes a fake JWT payload from its UTF-8 bytes, as an IdP would
const makeToken = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `header.${encoded}.signature`;
};

describe('getEmailFromAccessToken', () => {
  it('returns the email claim when the access token carries one', () => {
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: 'user@example.com' }))).toBe('user@example.com');
  });

  it('returns undefined when the access token carries no email claim', () => {
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', scope: 'openid data-admin' }))).toBeUndefined();
  });

  it('treats an empty email claim as unavailable', () => {
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: '' }))).toBeUndefined();
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: '   ' }))).toBeUndefined();
  });

  it('ignores a non-string email claim', () => {
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: 42 }))).toBeUndefined();
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: null }))).toBeUndefined();
  });

  it('decodes non-ASCII email claims correctly', () => {
    expect(getEmailFromAccessToken(makeToken({ sub: 'abc', email: 'jörg@example.com' }))).toBe('jörg@example.com');
  });

  it('returns undefined for a malformed token', () => {
    expect(getEmailFromAccessToken('not-a-valid-jwt')).toBeUndefined();
  });

  it('returns undefined when there is no token at all', () => {
    expect(getEmailFromAccessToken(undefined)).toBeUndefined();
  });
});
