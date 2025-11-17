import { getAuthToken } from './auth';
import { handleError } from './error';
import { APIRequestConfig } from './types/api';

export async function httpClient<T = any>(config: APIRequestConfig): Promise<T> {
  const { url, method = 'GET', headers = {}, body, signal } = config;

  const token = getAuthToken();

  const finalHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  try {
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body 
        ? (finalHeaders['Content-Type'].includes('application/json') 
            ? JSON.stringify(body) 
            : body)
        : undefined,
      signal,
    });

    if (!response.ok) {
      // delegate standardized error handling
      throw await handleError(response);
    }

    // try parsing JSON safely
    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    // if it’s a blob (file download)
    if (contentType?.includes('application/octet-stream')) {
      return (await response.blob()) as T;
    }

    // fallback: plain text
    return (await response.text()) as T;
  } catch (err) {
    console.error('HTTP error:', err);
    throw err;
  }
}
