import { ssrAuthStore } from '../auth/ssrAuthStore';
import { COOKIE_DOMAIN } from '../utilities/environmentVariables';

// The token is mirrored into a cookie (in addition to localStorage) so that
// the SSR server can read it on the initial document navigation. localStorage
// is never sent over HTTP, but a cookie rides along with every request to the
// origin, which is the only way server/index.ts can see the token before any
// client JS runs. SameSite=Lax keeps it off cross-site requests while still
// sending it on top-level GET navigations (links, bookmarks, refresh).
//
// Note: this cookie is not HttpOnly — it must be set/cleared from JS — so it
// carries the same XSS exposure as the existing localStorage token, no worse.
export const TOKEN_COOKIE_NAME = 'token';

function setTokenCookie(token: string) {
  if (typeof document === 'undefined') return;
  const parts = [`${TOKEN_COOKIE_NAME}=${token}`, 'path=/', 'SameSite=Lax'];
  if (COOKIE_DOMAIN) parts.push(`domain=${COOKIE_DOMAIN}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

function clearTokenCookie() {
  if (typeof document === 'undefined') return;
  const parts = [`${TOKEN_COOKIE_NAME}=`, 'path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (COOKIE_DOMAIN) parts.push(`domain=${COOKIE_DOMAIN}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

export function saveToken(token: string | undefined) {
  if (token) {
    localStorage.setItem('token', token);
    setTokenCookie(token);
  }
}

export function getToken() {
  // On the server (SSR), read from the request-scoped store set by server/index.ts.
  // On the client, read from localStorage.
  return typeof window === 'undefined' ? ssrAuthStore.get() : localStorage.getItem('token');
}

export function clearToken() {
  localStorage.removeItem('token');
  clearTokenCookie();
}
