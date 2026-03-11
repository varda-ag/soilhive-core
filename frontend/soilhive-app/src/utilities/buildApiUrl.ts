import { BACKEND_BASE_URL } from '../configuration/api';

export function buildApiUrl(endpoint: string, parameters?: Array<[string, string]>) {
  let url = `${BACKEND_BASE_URL}${endpoint}`;

  if (parameters) {
    const urlObj = new URL(url);
    for (const [key, value] of parameters) {
      urlObj.searchParams.append(key, value);
    }
    url = urlObj.href;
  }

  return url;
}
