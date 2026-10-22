import { getToken } from '../auth/tokenStore';
import { refreshAccessToken } from '../auth/tokenRefresher';
import { handleError } from './error';
import { type APIRequestConfig } from './types/api';

export async function httpClient<T = any>(config: APIRequestConfig): Promise<T> {
  const { url, method = 'GET', headers = {}, body, signal, isBlobResponse } = config;
  const useAuth = config.authenticate !== false;

  const doFetch = (token: string | null): Promise<Response> => {
    const defaultHeaders: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (body && !(body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const finalHeaders: HeadersInit = {
      ...defaultHeaders,
      ...headers,
    };

    return fetch(url, {
      method,
      headers: finalHeaders,
      body: body ? (finalHeaders['Content-Type']?.includes('application/json') ? JSON.stringify(body) : body) : undefined,
      signal,
    });
  };

  let response = await doFetch(useAuth ? getToken() : null);

  // Access token can expire before silent renew.
  // Force renew and retry once before surfacing 401 error.
  if (response.status === 401 && useAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await doFetch(refreshed);
    }
  }

  if (!response.ok) {
    // delegate standardized error handling
    throw await handleError(response);
  }

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  // try parsing JSON safely
  const contentType = response.headers.get('Content-Type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  // if it’s a blob (file download)
  if (contentType?.includes('application/octet-stream') || contentType?.includes('image/svg+xml') || isBlobResponse) {
    return (await response.blob()) as T;
  }

  // Unexpected content type — likely BACKEND_BASE_URL is unset and the SPA
  // catch-all responded with index.html instead of the real API.
  throw Object.assign(new Error(`API returned unexpected content type: "${contentType ?? 'none'}". Check BACKEND_BASE_URL.`), {
    status: response.status,
  });
}
