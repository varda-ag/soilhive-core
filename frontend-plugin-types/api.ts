// ---- The plugin's own backend (reached through the core backend's /plugins/{pluginId}/ route) ----

export type PluginApiParamValue = string | number | boolean | null | undefined;

// An array repeats its key once per item; null and undefined leave the key out.
export type PluginApiParams = Record<string, PluginApiParamValue | PluginApiParamValue[]>;

export interface PluginApiRequestOptions {
  params?: PluginApiParams; // appended to the query string
  headers?: Record<string, string>;
  signal?: AbortSignal; // aborting rejects the call with the AbortError itself, not a PluginApiError
  responseType?: 'json' | 'blob'; // default 'json'; 'blob' reads a response of any type, e.g. a file
}

// What a call rejects with, unless it was aborted.
export interface PluginApiError extends Error {
  status: number; // the response's HTTP status, or 0 when there was no response
  body?: unknown; // the response's JSON body, if it had one
}

// Paths are relative to the plugin's own backend: get('/zones') calls its /zones. A body is sent as
// JSON, or as multipart when it is FormData. A 204 or empty response resolves to undefined.
export interface PluginApi {
  get: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  delete: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
}
