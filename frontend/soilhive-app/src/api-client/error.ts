import { clearToken } from '../auth/tokenStore';

export async function handleError(response: Response) {
  let details: any = null;

  try {
    details = await response.json();
  } catch {
    // Intentionally left empty
  }

  const error = {
    status: response.status,
    statusText: response.statusText,
    message: details?.detail || details?.message || 'Unknown error',
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
