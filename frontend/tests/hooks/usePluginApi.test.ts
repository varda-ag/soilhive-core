import { renderHook } from '@testing-library/react';
import { buildPluginApiUrl, usePluginApi } from 'hooks/usePluginApi';
import { getToken } from '../../src/auth/tokenStore';
import { refreshAccessToken } from '../../src/auth/tokenRefresher';

jest.mock('configuration/api', () => ({
  ...jest.requireActual('configuration/api'),
  BACKEND_BASE_URL: 'https://api.example/api/v1',
}));
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

const ROUTE = 'https://api.example/api/v1/plugins/my-plugin';

function mockResponse({ status = 200, body, contentType = 'application/json' }: { status?: number; body?: unknown; contentType?: string }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name: string) => (name === 'Content-Type' ? contentType : null) },
    json: async () => body,
    blob: async () => body,
  } as unknown as Response;
}

const fetchCall = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit & { headers: Record<string, string> }];
  return { url, ...init };
};

const renderApi = () => renderHook(() => usePluginApi('my-plugin')).result.current;

beforeEach(() => {
  jest.clearAllMocks();
  getTokenMock.mockReturnValue('tok');
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('usePluginApi', () => {
  it("sends a GET to the plugin's route on the core backend, with the user's token", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { zones: [] } }));

    const data = await renderApi().get('/zones');

    expect(data).toEqual({ zones: [] });
    expect(fetchCall()).toMatchObject({ url: `${ROUTE}/zones`, method: 'GET', body: undefined, headers: { Authorization: 'Bearer tok' } });
  });

  it.each(['post', 'put', 'patch'] as const)('sends the body of %s as JSON', async method => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { id: 'z1' } }));

    const data = await renderApi()[method]('/zones', { name: 'North' });

    expect(data).toEqual({ id: 'z1' });
    expect(fetchCall()).toMatchObject({
      url: `${ROUTE}/zones`,
      method: method.toUpperCase(),
      body: JSON.stringify({ name: 'North' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('sends a DELETE without a body, and resolves a 204 to undefined', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await expect(renderApi().delete('/zones/z1')).resolves.toBeUndefined();
    expect(fetchCall()).toMatchObject({ url: `${ROUTE}/zones/z1`, method: 'DELETE', body: undefined });
  });

  it('appends params, repeating the key for each array item and leaving out null and undefined', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: [] }));

    await renderApi().get('/zones', { params: { bbox: [1, 2.5, 3, 4], q: 'a b', all: true, page: undefined, owner: null } });

    expect(fetchCall().url).toBe(`${ROUTE}/zones?bbox=1&bbox=2.5&bbox=3&bbox=4&q=a+b&all=true`);
  });

  it('passes headers and the abort signal through', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(mockResponse({ body: [] }));

    await renderApi().get('/zones', { headers: { 'Accept-Language': 'fr' }, signal: controller.signal });

    expect(fetchCall()).toMatchObject({ headers: { 'Accept-Language': 'fr', Authorization: 'Bearer tok' }, signal: controller.signal });
  });

  it('reads a response of any type as a Blob with responseType blob', async () => {
    const csv = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    fetchMock.mockResolvedValueOnce(mockResponse({ body: csv, contentType: 'text/csv' }));

    await expect(renderApi().get('/export', { responseType: 'blob' })).resolves.toBe(csv);
  });

  it('rejects with a PluginApiError carrying the status, message and JSON body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: { detail: 'No such zone' } }));

    const error = await renderApi()
      .get('/zones/z9')
      .catch(caught => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'PluginApiError', status: 404, message: 'No such zone', body: { detail: 'No such zone' } });
  });

  it('rejects with status 0 when no response arrived', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(renderApi().get('/zones')).rejects.toMatchObject({ name: 'PluginApiError', status: 0, message: 'Failed to fetch' });
  });

  it('rejects an aborted call with the AbortError itself', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);

    await expect(renderApi().get('/zones')).rejects.toBe(abort);
  });

  it('refreshes the token and retries once when the core backend answers 401', async () => {
    getTokenMock.mockReturnValue('stale');
    refreshMock.mockResolvedValue('fresh');
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 401, body: { detail: 'expired' } }))
      .mockResolvedValueOnce(mockResponse({ body: [] }));

    await expect(renderApi().get('/zones')).resolves.toEqual([]);
    expect(fetchCall(1).headers.Authorization).toBe('Bearer fresh');
  });

  it('rejects a path outside its route without sending anything', async () => {
    await expect(renderApi().get('/../other-plugin/zones')).rejects.toMatchObject({ name: 'PluginApiError', status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the same client across renders, and makes a new one for another plugin id', () => {
    const { result, rerender } = renderHook(({ pluginId }) => usePluginApi(pluginId), { initialProps: { pluginId: 'my-plugin' } });
    const first = result.current;

    rerender({ pluginId: 'my-plugin' });
    expect(result.current).toBe(first);

    rerender({ pluginId: 'other-plugin' });
    expect(result.current).not.toBe(first);
  });
});

describe('buildPluginApiUrl', () => {
  it('accepts a path without a leading slash, and keeps a query string already in it', () => {
    expect(buildPluginApiUrl('my-plugin', 'zones?sort=name', { page: 2 })).toBe(`${ROUTE}/zones?sort=name&page=2`);
  });

  it('encodes the plugin id into a single path segment', () => {
    expect(buildPluginApiUrl('my plugin/v2', '/zones')).toBe('https://api.example/api/v1/plugins/my%20plugin%2Fv2/zones');
  });

  it('resolves dot segments that stay inside the route', () => {
    expect(buildPluginApiUrl('my-plugin', '/zones/../areas')).toBe(`${ROUTE}/areas`);
  });

  it.each(['/../other-plugin/zones', 'zones/../../other-plugin', '/%2e%2e/other-plugin', '/..'])(
    'refuses %s, which resolves outside the route',
    path => {
      expect(() => buildPluginApiUrl('my-plugin', path)).toThrow('resolves outside /plugins/my-plugin/');
    },
  );
});
