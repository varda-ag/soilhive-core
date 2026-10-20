// ---- The plugin's own backend, called straight from the browser with a Plugin token ----

export type PluginApiParamValue = string | number | boolean | null | undefined;

// An array repeats its key once per item; null and undefined leave the key out.
export type PluginApiParams = Record<string, PluginApiParamValue | PluginApiParamValue[]>;

// Where the client sends calls. By default, the folder that holds the plugin's mf-manifest.json:
// a remote at https://zones.example/mf-manifest.json calls https://zones.example/..., one at
// https://plugins.example/zones/mf-manifest.json calls https://plugins.example/zones/...
export interface PluginApiClientOptions {
  baseUrl?: string; // absolute, https (http only on localhost); '' counts as unset
}

export interface PluginApiRequestOptions {
  params?: PluginApiParams; // appended to the query string
  // Sent as given, except Authorization, which is always the Plugin token. A header other than
  // Content-Type needs the backend's CORS approval (Access-Control-Allow-Headers).
  headers?: Record<string, string>;
  signal?: AbortSignal; // aborting rejects the call with the AbortError itself, not a PluginApiError
  responseType?: 'json' | 'blob'; // default 'json'; 'blob' reads a response of any type, e.g. a file
}

// What a call rejects with, unless it was aborted. When the core refused a Plugin token (401, 403,
// 429, 503), the message starts with "Could not get a plugin token".
export interface PluginApiError extends Error {
  status: number; // the response's HTTP status, or 0 when there was no response (a CORS refusal too)
  body?: unknown; // the response's JSON body, if it had one
}

// Paths are relative to the client's base and may not leave it: get('/zones') calls {base}/zones.
// A body is sent as JSON, or as is when it is FormData, a Blob or binary data. A 204 or empty
// response resolves to undefined.
export interface PluginApi {
  get: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  delete: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
}
