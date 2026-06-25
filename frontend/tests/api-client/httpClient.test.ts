// httpClient.test.ts
//
// Covers the 401 recovery flow: when an authenticated request 401s (typically an
// access token that expired before the scheduled silent renew fired), httpClient
// forces a one-shot silent renew via refreshAccessToken() and retries once with
// the fresh token before surfacing the error.
import { httpClient } from '../../src/api-client/httpClient';
import { getToken } from '../../src/auth/tokenStore';
import { refreshAccessToken } from '../../src/auth/tokenRefresher';

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn(),
  clearToken: jest.fn(), // used by handleError on 401
}));

jest.mock('../../src/auth/tokenRefresher', () => ({
  refreshAccessToken: jest.fn(),
}));

const getTokenMock = getToken as jest.Mock;
const refreshMock = refreshAccessToken as jest.Mock;
const fetchMock = jest.fn();

type MockResponseInit = {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: unknown;
  contentType?: string;
};

function mockResponse({ ok, status, statusText = '', body, contentType = 'application/json' }: MockResponseInit): Response {
  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) => (name === 'Content-Type' ? contentType : null),
    },
    json: async () => body,
    blob: async () => body,
  } as unknown as Response;
}

const authHeader = (callIndex: number): string | undefined =>
  (fetchMock.mock.calls[callIndex][1].headers as Record<string, string>).Authorization;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('httpClient', () => {
  it('sends the bearer token and returns the parsed body on success — no refresh', async () => {
    getTokenMock.mockReturnValue('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 200, body: { id: 1 } }));

    const data = await httpClient({ url: '/datasets', method: 'POST', body: { name: 'x' } });

    expect(data).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authHeader(0)).toBe('Bearer tok');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('refreshes and retries once with the fresh token when the first request 401s', async () => {
    getTokenMock.mockReturnValue('stale');
    refreshMock.mockResolvedValue('fresh');
    fetchMock
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 401, body: { detail: 'expired' } }))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, body: { id: 2 } }));

    const data = await httpClient({ url: '/datasets', method: 'POST', body: { name: 'x' } });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(0)).toBe('Bearer stale');
    expect(authHeader(1)).toBe('Bearer fresh');
    expect(data).toEqual({ id: 2 });
  });

  it('does not retry and throws the 401 when the refresh yields no token', async () => {
    getTokenMock.mockReturnValue('stale');
    refreshMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 401, statusText: 'Unauthorized', body: { detail: 'expired' } }));

    await expect(httpClient({ url: '/datasets', method: 'GET' })).rejects.toMatchObject({
      status: 401,
      message: 'expired',
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries only once: a 401 on the retry is surfaced without a second refresh', async () => {
    getTokenMock.mockReturnValue('stale');
    refreshMock.mockResolvedValue('fresh');
    fetchMock
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 401, body: { detail: 'expired' } }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 401, statusText: 'Unauthorized', body: { detail: 'still expired' } }));

    await expect(httpClient({ url: '/datasets', method: 'GET' })).rejects.toMatchObject({
      status: 401,
      message: 'still expired',
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh for unauthenticated requests (authenticate: false)', async () => {
    getTokenMock.mockReturnValue('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 401, statusText: 'Unauthorized', body: { detail: 'nope' } }));

    await expect(httpClient({ url: '/auth/config', method: 'GET', authenticate: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(authHeader(0)).toBeUndefined();
  });

  it('does not refresh on non-401 errors', async () => {
    getTokenMock.mockReturnValue('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, statusText: 'Server Error', body: { detail: 'boom' } }));

    await expect(httpClient({ url: '/datasets', method: 'GET' })).rejects.toMatchObject({ status: 500 });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
