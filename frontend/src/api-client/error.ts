export async function handleError(response: Response) {
  let details: any = null;

  try {
    details = await response.json();
  } catch {
    // Intentionally left empty
  }

  const rawMessage = details?.detail ?? details?.message;
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage != null ? String(rawMessage) : 'Unknown error';

  const error = {
    status: response.status,
    statusText: response.statusText,
    message,
    raw: details,
    retryAfter: response.headers.get('Retry-After'),
  };

  // No clearToken() on a 401: the httpClient renews, ends the session, or keeps it when the login
  // server cannot be reached. The token belongs to the auth providers.

  if (response.status === 403) {
    console.warn('Forbidden:', error.message);
  }

  return error;
}
