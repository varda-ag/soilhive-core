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
  // Sent as given, except Authorization, which is always the Plugin token. The backend's CORS
  // preflight must allow Authorization by name ('*' does not cover it), Content-Type (a JSON body
  // sends application/json), and any header added here.
  headers?: Record<string, string>;
  // Aborting rejects with signal.reason, not a PluginApiError: an AbortError for abort(), a
  // TimeoutError for AbortSignal.timeout()
  signal?: AbortSignal;
  // 'json' (default) parses a JSON response (application/json or a +json type), returns an
  // application/octet-stream or image/svg+xml one as a Blob, and rejects any other type; 'blob'
  // reads a response of any type, e.g. a file
  responseType?: 'json' | 'blob';
}

// What a call rejects with, unless it was aborted; check error.name. When the core refused a Plugin
// token (401, 403, 429, 503) or could not be reached (0), the message starts with "Could not get a
// plugin token".
export interface PluginApiError extends Error {
  name: 'PluginApiError';
  // The response's HTTP status (a 2xx when its type was unexpected or its body could not be read),
  // or 0 when no response came: a CORS refusal or a redirect, or a call refused before sending (no
  // backend address, a bad baseUrl, a path outside the base, a ReadableStream body). Retrying 0 can
  // loop forever.
  status: number;
  body?: unknown; // the response's JSON body, if it had one
}

// Paths are relative to the client's base and may not leave it: get('/zones') calls {base}/zones.
// A body is sent as JSON, or as is when it is FormData, a Blob or binary data. A 204, or a response
// with Content-Length: 0, resolves to undefined. Another empty body rejects unless it is read as a
// Blob, so a backend with nothing to send answers 204.
export interface PluginApi {
  get: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown, options?: PluginApiRequestOptions) => Promise<T>;
  delete: <T = unknown>(path: string, options?: PluginApiRequestOptions) => Promise<T>;
}
