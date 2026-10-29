import React from 'react';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { renderHook } from '@testing-library/react';
import type { PluginApiClientOptions } from 'frontend-plugin-types';
import { buildPluginApiUrl, defaultPluginApiBase, resolvePluginApiBase, usePluginApi } from 'hooks/usePluginApi';
import { RemotesContext } from '../../src/contexts/RemotesContext';
import { getPluginToken, getPluginTokenOwner, renewPluginToken } from '../../src/auth/pluginTokens';
import { clearToken, getToken } from '../../src/auth/tokenStore';
import { refreshAccessToken } from '../../src/auth/tokenRefresher';
import { PluginType, type RemotePlugin } from '../../src/types/plugins';

jest.mock('../../src/auth/pluginTokens', () => ({
  getPluginToken: jest.fn(),
  getPluginTokenOwner: jest.fn(),
  renewPluginToken: jest.fn(),
}));
jest.mock('../../src/auth/tokenStore', () => ({ getToken: jest.fn(), clearToken: jest.fn() }));
jest.mock('../../src/auth/tokenRefresher', () => ({ refreshAccessToken: jest.fn() }));

const getPluginTokenMock = getPluginToken as jest.Mock;
const renewPluginTokenMock = renewPluginToken as jest.Mock;
const ownerMock = getPluginTokenOwner as jest.Mock;
const getTokenMock = getToken as jest.Mock;
const fetchMock = jest.fn();

const REMOTE_URL = 'https://plugins.example/zones/mf-manifest.json';
const BASE = 'https://plugins.example/zones/';

const remote = (pluginId: string, remoteUrl?: string): RemotePlugin => ({
  pluginId,
  name: pluginId,
  type: PluginType.SINGLE_PAGE,
  remoteUrl,
});

function mockResponse({ status = 200, body, contentType = 'application/json' }: { status?: number; body?: unknown; contentType?: string }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name: string) => (name === 'Content-Type' ? contentType : null) },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
    blob: async () => body,
  } as unknown as Response;
}

const fetchCall = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit & { headers: Headers }];
  return { url, ...init, authorization: init.headers.get('Authorization') };
};

const wrapperWith = (plugins: RemotePlugin[]) =>
  function RemotesWrapper({ children }: { children: React.ReactNode }) {
    return <RemotesContext.Provider value={{ plugins, mapInfoCards: [], isLoadingRemotes: false }}>{children}</RemotesContext.Provider>;
  };

const renderApi = (options?: PluginApiClientOptions, plugins = [remote('zones', REMOTE_URL)]) =>
  renderHook(() => usePluginApi('zones', options), { wrapper: wrapperWith(plugins) }).result.current;

beforeEach(() => {
  jest.clearAllMocks();
  getTokenMock.mockReturnValue('user-token');
  ownerMock.mockReturnValue('idp\nalice');
  getPluginTokenMock.mockResolvedValue('pt-1');
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('usePluginApi', () => {
  describe('where calls go', () => {
    it("sends a GET to the folder of the plugin's manifest, with the Plugin token", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: { zones: [] } }));

      const data = await renderApi().get('/zones');

      expect(data).toEqual({ zones: [] });
      expect(fetchCall()).toMatchObject({
        url: `${BASE}zones`,
        method: 'GET',
        body: undefined,
        authorization: 'Bearer pt-1',
        credentials: 'omit',
        redirect: 'error',
      });
      expect(getPluginTokenMock).toHaveBeenCalledWith('zones', undefined);
    });

    it('calls the origin for a plugin served at its root', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      await renderApi(undefined, [remote('zones', 'https://zones.example/mf-manifest.json')]).get('/api/zones');
      expect(fetchCall().url).toBe('https://zones.example/api/zones');
    });

    it('prefers the baseUrl the plugin passes, treating an empty one as unset', async () => {
      fetchMock.mockResolvedValue(mockResponse({ body: {} }));
      await renderApi({ baseUrl: 'https://api.zones.example/v2' }).get('zones');
      await renderApi({ baseUrl: '' }).get('zones');
      expect(fetchCall(0).url).toBe('https://api.zones.example/v2/zones');
      expect(fetchCall(1).url).toBe(`${BASE}zones`);
    });

    it.each([
      ['an unknown plugin', undefined, []],
      ['a relative baseUrl', { baseUrl: '/api' }, undefined],
      ['an http baseUrl off localhost', { baseUrl: 'http://zones.example' }, undefined],
      ['a baseUrl with credentials', { baseUrl: 'https://user:pass@zones.example' }, undefined],
    ])('rejects every call for %s, before any mint or fetch', async (_, options, plugins) => {
      await expect(renderApi(options, plugins as RemotePlugin[] | undefined).get('/zones')).rejects.toMatchObject({
        name: 'PluginApiError',
        status: 0,
      });
      expect(getPluginTokenMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts http on localhost', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      await renderApi({ baseUrl: 'http://localhost:8080' }).get('/zones');
      expect(fetchCall().url).toBe('http://localhost:8080/zones');
    });

    it('rejects a path that leaves the base, before any mint', async () => {
      await expect(renderApi().get('../other-plugin/zones')).rejects.toMatchObject({ status: 0 });
      expect(getPluginTokenMock).not.toHaveBeenCalled();
    });
  });

  describe('what is sent', () => {
    it.each(['post', 'put', 'patch'] as const)('sends the body of %s as JSON', async method => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: { id: 'z1' } }));
      await renderApi()[method]('/zones', { name: 'Field' });
      const call = fetchCall();
      expect(call).toMatchObject({ method: method.toUpperCase(), body: JSON.stringify({ name: 'Field' }) });
      expect(call.headers.get('Content-Type')).toBe('application/json');
    });

    it('sends FormData as is, letting the browser set its type', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));
      const form = new FormData();
      await renderApi().post('/files', form);
      expect(fetchCall().body).toBe(form);
      expect(fetchCall().headers.has('Content-Type')).toBe(false);
    });

    it('refuses a ReadableStream body before getting a token, rather than sending it as {}', async () => {
      // jsdom has no ReadableStream: Node's stands in for the browser's
      const previous = global.ReadableStream;
      global.ReadableStream = NodeReadableStream as unknown as typeof ReadableStream;
      try {
        await expect(renderApi().post('/files', new ReadableStream())).rejects.toMatchObject({ name: 'PluginApiError', status: 0 });
        expect(getPluginTokenMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        global.ReadableStream = previous;
      }
    });

    it('sends the body as JSON under a +json Content-Type the plugin sets', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));
      const feature = { type: 'Feature', geometry: null, properties: {} };
      await renderApi().post('/zones', feature, { headers: { 'Content-Type': 'application/geo+json' } });
      expect(fetchCall().body).toBe(JSON.stringify(feature));
      expect(fetchCall().headers.get('Content-Type')).toBe('application/geo+json');
    });

    it('keeps a Content-Type the plugin sets, whatever its case', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));
      await renderApi().post('/csv', 'a,b', { headers: { 'content-type': 'text/csv' } });
      expect(fetchCall().headers.get('Content-Type')).toBe('text/csv');
      expect(fetchCall().body).toBe('a,b');
    });

    it.each(['Authorization', 'authorization', 'AUTHORIZATION'])('drops an %s header the plugin sets', async name => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      await renderApi().get('/zones', { headers: { [name]: 'Bearer the-user-token', 'X-Trace': '1' } });
      expect(fetchCall().authorization).toBe('Bearer pt-1');
      expect(fetchCall().headers.get('X-Trace')).toBe('1');
    });

    it('sends no Authorization for an anonymous visitor', async () => {
      getPluginTokenMock.mockResolvedValue(null);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      await renderApi().get('/zones', { headers: { Authorization: 'Bearer x' } });
      expect(fetchCall().authorization).toBeNull();
    });

    it('builds the query from params', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      await renderApi().get('/zones', { params: { bbox: [1, 2], q: 'a b', skip: null, none: undefined } });
      expect(fetchCall().url).toBe(`${BASE}zones?bbox=1&bbox=2&q=a+b`);
    });
  });

  describe('what comes back', () => {
    it('resolves a 204 to undefined', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 204, contentType: '' }));
      expect(await renderApi().delete('/zones/1')).toBeUndefined();
    });

    it.each(['application/json; charset=utf-8', 'application/geo+json', 'application/problem+json', 'application/vnd.api+json'])(
      'parses a %s response as JSON',
      async contentType => {
        fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, body: { id: 'z1' }, contentType }));
        expect(await renderApi().post('/zones', { name: 'Field' })).toEqual({ id: 'z1' });
      },
    );

    it('rejects a type that is not JSON, nor a blob', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: '<html>', contentType: 'text/html' }));
      await expect(renderApi().get('/zones')).rejects.toMatchObject({ name: 'PluginApiError', status: 200 });
    });

    it.each([
      ['bad JSON', new SyntaxError("Expected property name or '}' in JSON at position 1")],
      ['an empty body without Content-Length: 0', new SyntaxError('Unexpected end of JSON input')],
    ])('rejects %s in a 2xx response with a PluginApiError carrying its status', async (_, failure) => {
      fetchMock.mockResolvedValueOnce({
        ...mockResponse({ status: 201 }),
        json: async () => {
          throw failure;
        },
      });
      await expect(renderApi().post('/zones', { name: 'Field' })).rejects.toMatchObject({
        name: 'PluginApiError',
        status: 201,
        message: `Could not read the plugin backend's response: ${failure.message}`,
      });
    });

    it('rejects a blob whose body breaks off with a PluginApiError', async () => {
      fetchMock.mockResolvedValueOnce({
        ...mockResponse({ contentType: 'application/octet-stream' }),
        blob: async () => {
          throw new TypeError('network error');
        },
      });
      await expect(renderApi().get('/export')).rejects.toMatchObject({ name: 'PluginApiError', status: 200 });
    });

    it('passes an abort while the body arrives through as is', async () => {
      const controller = new AbortController();
      fetchMock.mockResolvedValueOnce({
        ...mockResponse({ body: {} }),
        json: async () => {
          controller.abort();
          throw controller.signal.reason;
        },
      });
      const error = await renderApi()
        .get('/zones', { signal: controller.signal })
        .catch(e => e);
      expect(error).toBe(controller.signal.reason);
      expect(error).toMatchObject({ name: 'AbortError' });
    });

    it('returns a blob when asked, whatever the type', async () => {
      const blob = new Blob(['a,b']);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: blob, contentType: 'text/csv' }));
      expect(await renderApi().get('/export', { responseType: 'blob' })).toBe(blob);
    });

    it('rejects an error response with a PluginApiError carrying its status and body', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: { detail: 'No such zone' } }));
      const error = await renderApi()
        .get('/zones/9')
        .catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ name: 'PluginApiError', status: 404, message: 'No such zone', body: { detail: 'No such zone' } });
    });

    it('rejects a network failure, or a CORS refusal, with status 0', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(renderApi().get('/zones')).rejects.toMatchObject({ name: 'PluginApiError', status: 0, message: 'Failed to fetch' });
    });

    it('passes an abort through as is', async () => {
      const controller = new AbortController();
      controller.abort();
      fetchMock.mockRejectedValueOnce(controller.signal.reason);
      await expect(renderApi().get('/zones', { signal: controller.signal })).rejects.toBe(controller.signal.reason);
    });

    it.each([
      [401, { status: 401, message: 'Token has expired' }],
      [429, { status: 429, message: 'Too many Plugin tokens requested' }],
      [503, { status: 503, message: 'Plugin tokens are not configured' }],
      [0, new TypeError('Failed to fetch')],
    ])('rejects with the mint status %s when no Plugin token comes, and never calls the backend', async (status, mintFailure) => {
      getPluginTokenMock.mockRejectedValueOnce(mintFailure);
      await expect(renderApi().get('/zones')).rejects.toMatchObject({
        name: 'PluginApiError',
        status,
        message: expect.stringMatching(/^Could not get a plugin token/),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('a 401 from the Plugin Backend', () => {
    it('renews the Plugin token and retries once, sending the same body again', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 })).mockResolvedValueOnce(mockResponse({ body: { id: 'z1' } }));
      renewPluginTokenMock.mockResolvedValueOnce('pt-2');

      expect(await renderApi().post('/zones', { name: 'Field' })).toEqual({ id: 'z1' });

      expect(renewPluginTokenMock).toHaveBeenCalledWith('zones', 'pt-1', undefined);
      expect(fetchCall(1)).toMatchObject({ authorization: 'Bearer pt-2', body: JSON.stringify({ name: 'Field' }) });
    });

    it("surfaces a second 401 and never touches the user's token", async () => {
      fetchMock.mockResolvedValue(mockResponse({ status: 401, body: { detail: 'Invalid token' } }));
      renewPluginTokenMock.mockResolvedValueOnce('pt-2');

      await expect(renderApi().get('/zones')).rejects.toMatchObject({ status: 401 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(clearToken).not.toHaveBeenCalled();
      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('surfaces the 401 when the token is too young to renew', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));
      renewPluginTokenMock.mockResolvedValueOnce(null);
      await expect(renderApi().get('/zones')).rejects.toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('is not retried for an anonymous visitor', async () => {
      getPluginTokenMock.mockResolvedValue(null);
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));
      await expect(renderApi().get('/zones')).rejects.toMatchObject({ status: 401 });
      expect(renewPluginTokenMock).not.toHaveBeenCalled();
    });

    it('is not retried once the user changed', async () => {
      fetchMock.mockImplementationOnce(async () => {
        ownerMock.mockReturnValue('idp\nbob');
        return mockResponse({ status: 401 });
      });
      await expect(renderApi().post('/zones', {})).rejects.toMatchObject({ status: 401 });
      expect(renewPluginTokenMock).not.toHaveBeenCalled();
    });

    it('is still retried after a silent renew of the same user', async () => {
      fetchMock
        .mockImplementationOnce(async () => {
          getTokenMock.mockReturnValue('renewed-user-token'); // the owner stays the same user
          return mockResponse({ status: 401 });
        })
        .mockResolvedValueOnce(mockResponse({ body: {} }));
      renewPluginTokenMock.mockResolvedValueOnce('pt-2');

      await expect(renderApi().get('/zones')).resolves.toEqual({});
      expect(fetchCall(1).authorization).toBe('Bearer pt-2');
    });

    it('is not retried after an abort', async () => {
      const controller = new AbortController();
      fetchMock.mockImplementationOnce(async () => {
        controller.abort();
        return mockResponse({ status: 401 });
      });
      await expect(renderApi().get('/zones', { signal: controller.signal })).rejects.toMatchObject({ status: 401 });
      expect(renewPluginTokenMock).not.toHaveBeenCalled();
    });
  });

  describe('client identity', () => {
    it('keeps one client across renders, an inline options object included', () => {
      const { result, rerender } = renderHook(({ baseUrl }) => usePluginApi('zones', { baseUrl }), {
        initialProps: { baseUrl: 'https://a.example' },
        wrapper: wrapperWith([remote('zones', REMOTE_URL)]),
      });
      const first = result.current;
      rerender({ baseUrl: 'https://a.example' });
      expect(result.current).toBe(first);
      rerender({ baseUrl: 'https://b.example' });
      expect(result.current).not.toBe(first);
    });

    it('works outside a RemotesProvider, with a baseUrl', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: {} }));
      const api = renderHook(() => usePluginApi('zones', { baseUrl: 'https://zones.example' })).result.current;
      await api.get('/x');
      expect(fetchCall().url).toBe('https://zones.example/x');
    });
  });
});

describe('defaultPluginApiBase', () => {
  it.each([
    ['https://zones.example/mf-manifest.json', 'https://zones.example/'],
    ['https://plugins.example/zones/mf-manifest.json', 'https://plugins.example/zones/'],
    ['https://plugins.example/zones/', 'https://plugins.example/zones/'],
  ])('reads %s as %s', (remoteUrl, base) => {
    expect(defaultPluginApiBase(remoteUrl)).toBe(base);
  });
});

describe('buildPluginApiUrl', () => {
  const base = resolvePluginApiBase('https://plugins.example/zones');

  it('accepts a path with or without a leading slash, and keeps its query', () => {
    expect(buildPluginApiUrl(base, 'zones?x=1')).toBe('https://plugins.example/zones/zones?x=1');
    expect(buildPluginApiUrl(base, '/zones')).toBe('https://plugins.example/zones/zones');
  });

  it('resolves inner dot segments', () => {
    expect(buildPluginApiUrl(base, 'a/../b')).toBe('https://plugins.example/zones/b');
  });

  it.each(['../other-plugin/zones', 'a/../../other-plugin', '%2e%2e/other-plugin', '..', 'https://evil.example/x'])(
    'rejects %s, which leaves the base',
    path => {
      expect(() => buildPluginApiUrl(base, path)).toThrow('resolves outside https://plugins.example/zones/');
    },
  );

  it('keeps a protocol-relative path under the base', () => {
    expect(buildPluginApiUrl(base, '//evil.example/x')).toBe('https://plugins.example/zones/evil.example/x');
  });

  it("reads a first segment with a ':' as a path, not as a URL scheme", () => {
    expect(buildPluginApiUrl(base, '/zones:search')).toBe('https://plugins.example/zones/zones:search');
    expect(buildPluginApiUrl(base, 'dashboards:1/zones')).toBe('https://plugins.example/zones/dashboards:1/zones');
  });

  it('accepts a full URL under the base', () => {
    expect(buildPluginApiUrl(base, 'https://plugins.example/zones/x')).toBe('https://plugins.example/zones/x');
  });
});
