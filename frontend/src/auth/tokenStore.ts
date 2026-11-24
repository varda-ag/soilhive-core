import { ssrAuthStore } from '../auth/ssrAuthStore';
import { COOKIE_DOMAIN } from '../utilities/environmentVariables';
import { ROUTER_BASENAME } from '../configuration/basePath';

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
export const TOKEN_STORAGE_KEY = 'token';
// Scoped to the app's own path, so other sites on the same host never receive it (ADR 0084).
const TOKEN_COOKIE_PATH = ROUTER_BASENAME;

/** Sets the cookie at `path`, or expires it there when `token` is null. */
function writeTokenCookie(token: string | null, path: string) {
  const parts = token ? [`${TOKEN_COOKIE_NAME}=${token}`, `path=${path}`] : [`${TOKEN_COOKIE_NAME}=`, `path=${path}`, 'Max-Age=0'];
  parts.push('SameSite=Lax');
  if (COOKIE_DOMAIN) parts.push(`domain=${COOKIE_DOMAIN}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

// A host that served the app at its root before APP_BASE_PATH was set left the
// cookie at path=/. There it reaches every other site on the host, and SSR reads
// it after logout, so expire it whenever the app writes its own (ADR 0084).
function expireRootTokenCookie() {
  if (TOKEN_COOKIE_PATH !== '/') writeTokenCookie(null, '/');
}

function setTokenCookie(token: string) {
  if (typeof document === 'undefined') return;
  writeTokenCookie(token, TOKEN_COOKIE_PATH);
  expireRootTokenCookie();
}

function clearTokenCookie() {
  if (typeof document === 'undefined') return;
  writeTokenCookie(null, TOKEN_COOKIE_PATH);
  expireRootTokenCookie();
}

export function saveToken(token: string | undefined) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setTokenCookie(token);
  }
}

export function getToken() {
  // On the server (SSR), read from the request-scoped store set by server/index.ts.
  // On the client, read from localStorage.
  return typeof window === 'undefined' ? ssrAuthStore.get() : localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  clearTokenCookie();
}
