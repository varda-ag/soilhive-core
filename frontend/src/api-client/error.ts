import { clearToken } from '../auth/tokenStore';

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
  };

  if (response.status === 401) {
    console.warn('Unauthorized: removing local token');
    clearToken();
  }

  if (response.status === 403) {
    console.warn('Forbidden:', error.message);
  }

  return error;
}
