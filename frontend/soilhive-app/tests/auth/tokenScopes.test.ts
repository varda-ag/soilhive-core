import { decodeTokenScope } from '../../src/auth/tokenScopes';

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn(),
}));

import { getToken } from '../../src/auth/tokenStore';

const mockGetToken = getToken as jest.Mock;

// helper — base64 encodes a fake JWT payload
const makeToken = (scope: string) => {
  const payload = btoa(JSON.stringify({ scope }));
  return `header.${payload}.signature`;
};

describe('decodeTokenScope', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty array when no token exists', () => {
    mockGetToken.mockReturnValue(null);
    expect(decodeTokenScope()).toEqual([]);
  });

  it('returns empty array when token has no matching scopes', () => {
    mockGetToken.mockReturnValue(makeToken('openid email profile'));
    expect(decodeTokenScope()).toEqual([]);
  });

  it('returns super-admin role when present in scope', () => {
    mockGetToken.mockReturnValue(makeToken('openid email super-admin'));
    expect(decodeTokenScope()).toEqual(['super-admin']);
  });

  it('returns data-admin role when present in scope', () => {
    mockGetToken.mockReturnValue(makeToken('openid email data-admin'));
    expect(decodeTokenScope()).toEqual(['data-admin']);
  });

  it('returns multiple roles when both present in scope', () => {
    mockGetToken.mockReturnValue(makeToken('openid super-admin data-admin'));
    expect(decodeTokenScope()).toEqual(['super-admin', 'data-admin']);
  });

  it('returns empty array when token is malformed', () => {
    mockGetToken.mockReturnValue('not-a-valid-jwt');
    expect(decodeTokenScope()).toEqual([]);
  });
});
