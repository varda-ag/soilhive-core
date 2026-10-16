import { useMemo } from 'react';
import type { PluginApi, PluginApiParams, PluginApiRequestOptions } from 'frontend-plugin-types';
import { BACKEND_BASE_URL, REST_END_POINTS } from 'configuration/api';
import { httpClient } from '../api-client/httpClient';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// The core backend forwards everything under /plugins/{pluginId}/ to that plugin's own backend.
// The id is encoded so that it stays one path segment.
export function buildPluginApiUrl(pluginId: string, path: string, params: PluginApiParams = {}): string {
  const prefix = `${BACKEND_BASE_URL}/${REST_END_POINTS.PLUGINS}/${encodeURIComponent(pluginId)}`;
  const url = new URL(`${prefix}/${path.replace(/^\//, '')}`);
  // URL resolves dot segments, so '/../other-plugin/x' would land under another plugin's prefix.
  if (!url.pathname.startsWith(`${new URL(prefix).pathname}/`)) {
    throw new Error(`Plugin API path "${path}" resolves outside /${REST_END_POINTS.PLUGINS}/${pluginId}/`);
  }
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      if (item !== null && item !== undefined) url.searchParams.append(key, String(item));
    }
  }
  return url.href;
}

// httpClient throws the parsed error response as a plain object; plugins get a real Error with a
// status, 0 when no response arrived. An abort is passed through as is, so a plugin can tell a
// cancelled call from a failed one.
const toPluginApiError = (error: unknown): unknown => {
  if ((error as { name?: string } | null)?.name === 'AbortError') return error;
  const { status, message, raw } = (error ?? {}) as { status?: number; message?: string; raw?: unknown };
  return Object.assign(new Error(message ?? 'Unknown error'), { name: 'PluginApiError', status: status ?? 0, body: raw ?? undefined });
};

// httpClient rather than useRequest: useRequest sets loading state on every call, which would
// re-render whichever component holds the client.
const createPluginApi = (pluginId: string): PluginApi => {
  const request = async <T>(method: Method, path: string, body: unknown, options: PluginApiRequestOptions = {}): Promise<T> => {
    try {
      return await httpClient<T>({
        url: buildPluginApiUrl(pluginId, path, options.params),
        method,
        body,
        headers: options.headers,
        signal: options.signal,
        isBlobResponse: options.responseType === 'blob',
      });
    } catch (error) {
      throw toPluginApiError(error);
    }
  };

  return {
    get: <T>(path: string, options?: PluginApiRequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: PluginApiRequestOptions) => request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options?: PluginApiRequestOptions) => request<T>('DELETE', path, undefined, options),
  };
};

// One client per pluginId, so it keeps its identity across renders and is safe in effect deps.
export function usePluginApi(pluginId: string): PluginApi {
  return useMemo(() => createPluginApi(pluginId), [pluginId]);
}
