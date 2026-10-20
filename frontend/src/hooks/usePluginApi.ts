import { useContext, useMemo } from 'react';
import type { PluginApi, PluginApiClientOptions, PluginApiParams, PluginApiRequestOptions } from 'frontend-plugin-types';
import { RemotesContext } from '../contexts/RemotesContext';
import { getToken } from '../auth/tokenStore';
import { getPluginToken, renewPluginToken } from '../auth/pluginTokens';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Plugins call their own backend straight from the browser, with a Plugin token instead of the
// user's token (docs/adr/0063). This client never uses httpClient or its error handling: a 401 from
// a Plugin Backend must never clear or renew the user's token.

const pluginApiError = (message: string, status: number, body?: unknown) =>
  Object.assign(new Error(message), { name: 'PluginApiError', status, body });

const isLocalhost = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');

/**
 * Where a plugin's calls go unless it passes `baseUrl`: the folder that holds its mf-manifest.json,
 * not the manifest's origin. Several plugins can share one origin under their own paths, as every
 * plugin in soilhive-plugins does, and each plugin's token must reach only its own backend. A
 * plugin served at the root of its origin gets that origin.
 */
export const defaultPluginApiBase = (remoteUrl: string): string => new URL('./', remoteUrl).href;

/** An absolute https base (http on localhost only) with no credentials, ending in '/'. */
export function resolvePluginApiBase(baseUrl: string): URL {
  const url = new URL(baseUrl);
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost(url.hostname));
  if (!allowed || url.username || url.password) {
    throw new Error(`Plugin backend address "${baseUrl}" must be https, or http on localhost, with no credentials`);
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

export function buildPluginApiUrl(base: URL, path: string, params: PluginApiParams = {}): string {
  const url = new URL(path.replace(/^\/+/, ''), base);
  // URL resolves dot segments (%2e%2e included), so '../other-plugin/x' would leave the base
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error(`Plugin API path "${path}" resolves outside ${base.href}`);
  }
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      if (item !== null && item !== undefined) url.searchParams.append(key, String(item));
    }
  }
  return url.href;
}

const isAbort = (error: unknown, signal?: AbortSignal) => signal?.aborted || (error as { name?: string } | null)?.name === 'AbortError';

// A failed mint keeps the core's status (401, 403, 429, 503) or 0 when no response arrived
const mintError = (error: unknown, signal?: AbortSignal): unknown => {
  if (isAbort(error, signal)) return signal?.reason ?? error;
  const { status, message, raw } = (error ?? {}) as { status?: number; message?: string; raw?: unknown };
  return pluginApiError(`Could not get a plugin token: ${message ?? 'Unknown error'}`, status ?? 0, raw);
};

const isRawBody = (body: unknown) =>
  body instanceof FormData ||
  body instanceof Blob ||
  body instanceof URLSearchParams ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body);

// A stream is read once, so a call that sends one is never retried
const canResend = (body: unknown) => !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);

const send = async (
  url: string,
  method: Method,
  body: unknown,
  options: PluginApiRequestOptions,
  token: string | null,
): Promise<Response> => {
  const headers = new Headers(options.headers);
  headers.delete('Authorization'); // only ever the Plugin token
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const hasBody = body !== undefined && body !== null;
  if (hasBody && !isRawBody(body) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const json = hasBody && !isRawBody(body) && headers.get('Content-Type')?.includes('application/json');
  try {
    return await fetch(url, {
      method,
      headers,
      body: hasBody ? (json ? JSON.stringify(body) : (body as BodyInit)) : undefined,
      signal: options.signal,
      credentials: 'omit', // the host's cookies, the user-token cookie among them, are not the plugin's
      redirect: 'error',
    });
  } catch (error) {
    if (isAbort(error, options.signal)) throw options.signal?.reason ?? error;
    // A CORS refusal looks the same as no response
    throw pluginApiError((error as Error | null)?.message ?? 'Failed to fetch', 0);
  }
};

const responseError = async (response: Response) => {
  let body: unknown = undefined;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status says it all
  }
  const { detail, message } = (body ?? {}) as { detail?: unknown; message?: unknown };
  const text = [detail, message].find(value => typeof value === 'string') as string | undefined;
  return pluginApiError(text ?? (response.statusText || `HTTP ${response.status}`), response.status, body);
};

const read = async <T>(response: Response, responseType: PluginApiRequestOptions['responseType']): Promise<T> => {
  if (response.status === 204 || response.headers.get('Content-Length') === '0') return undefined as T;
  // A caller that asked for a blob gets one whatever the type, a JSON file to download included
  if (responseType === 'blob') return (await response.blob()) as T;
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) return (await response.json()) as T;
  if (contentType.includes('application/octet-stream') || contentType.includes('image/svg+xml')) return (await response.blob()) as T;
  throw pluginApiError(`The plugin backend answered with an unexpected content type: "${contentType || 'none'}"`, response.status);
};

const createPluginApi = (pluginId: string, baseUrl: string | undefined): PluginApi => {
  let base: URL | undefined;
  let baseProblem = `No backend address for plugin "${pluginId}": it is not loaded, and it passed no baseUrl`;
  if (baseUrl) {
    try {
      base = resolvePluginApiBase(baseUrl);
    } catch (error) {
      baseProblem = (error as Error).message;
    }
  }

  const request = async <T>(method: Method, path: string, body: unknown, options: PluginApiRequestOptions = {}): Promise<T> => {
    // Checked before any mint, so a call that can't be sent costs nothing
    if (!base) throw pluginApiError(baseProblem, 0);
    let url: string;
    try {
      url = buildPluginApiUrl(base, path, options.params);
    } catch (error) {
      throw pluginApiError((error as Error).message, 0);
    }

    const owner = getToken();
    let token: string | null;
    try {
      token = await getPluginToken(pluginId, options.signal);
    } catch (error) {
      throw mintError(error, options.signal);
    }
    let response = await send(url, method, body, options, token);

    // Renew and retry once, as the same user: the Plugin token expired or its key rotated
    if (response.status === 401 && token && canResend(body) && !options.signal?.aborted && getToken() === owner) {
      let renewed: string | null;
      try {
        renewed = await renewPluginToken(pluginId, token, options.signal);
      } catch (error) {
        throw mintError(error, options.signal);
      }
      if (renewed) response = await send(url, method, body, options, renewed);
    }

    if (!response.ok) throw await responseError(response);
    return read<T>(response, options.responseType);
  };

  return {
    get: <T>(path: string, options?: PluginApiRequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options?: PluginApiRequestOptions) => request<T>('DELETE', path, undefined, options),
  };
};

// One client per pluginId and address, so it keeps its identity across renders (an inline options
// object included) and is safe in effect deps.
export function usePluginApi(pluginId: string, options?: PluginApiClientOptions): PluginApi {
  const remotes = useContext(RemotesContext);
  const remoteUrl = remotes?.plugins.find(plugin => plugin.pluginId === pluginId)?.remoteUrl;
  const baseUrl = options?.baseUrl || undefined;
  return useMemo(() => {
    let defaultBase: string | undefined;
    try {
      defaultBase = remoteUrl ? defaultPluginApiBase(remoteUrl) : undefined;
    } catch {
      defaultBase = undefined;
    }
    return createPluginApi(pluginId, baseUrl ?? defaultBase);
  }, [pluginId, baseUrl, remoteUrl]);
}
