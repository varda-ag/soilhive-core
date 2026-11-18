// httpClient.tokenStore.test.ts
//
// Uses the real tokenStore, so it sees what a 401 does to the stored token. The token is the auth
// providers' to clear (on sign-out or a rejected renew), never the httpClient's.
import { httpClient } from '../../src/api-client/httpClient';
import { getToken, saveToken } from '../../src/auth/tokenStore';
import { endSession, refreshAccessToken } from '../../src/auth/tokenRefresher';

jest.mock('../../src/auth/tokenRefresher', () => ({
  refreshAccessToken: jest.fn(),
  endSession: jest.fn(),
}));

const fetchMock = jest.fn();

const unauthorized = () =>
  ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    headers: { get: (name: string) => (name === 'Content-Type' ? 'application/json' : null) },
    json: async () => ({ detail: 'expired' }),
  }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('httpClient and the stored token', () => {
  it('keeps the token when the renew after a 401 cannot reach the login server', async () => {
    saveToken('still-mine');
    (refreshAccessToken as jest.Mock).mockResolvedValue({ outcome: 'unavailable', noResponse: true });
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(httpClient({ url: '/datasets', method: 'GET' })).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBe('still-mine');
    expect(endSession).not.toHaveBeenCalled();
  });

  it('keeps the token on a 401 for a request that did not send it', async () => {
    saveToken('still-mine');
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(httpClient({ url: '/auth/config', method: 'GET', authenticate: false })).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBe('still-mine');
  });
});
