import { ssrAuthStore } from '../auth/ssrAuthStore';

export function saveToken(token: string | undefined) {
  if (token) localStorage.setItem('token', token);
}

export function getToken() {
  // On the server (SSR), read from the request-scoped store set by server/index.ts.
  // On the client, read from localStorage.
  return typeof window === 'undefined' ? ssrAuthStore.get() : localStorage.getItem('token');
}

export function clearToken() {
  localStorage.removeItem('token');
}
