// Where an OIDC sign-in started, so the callback can put the user back there.
// It travels in the sign-in's custom `state`, which oidc-client-ts keeps in
// browser storage rather than in the URL, so a crafted link cannot set it.

export type SigninState = { returnTo: string };

// Appended by the identity provider when it redirects back from a sign-in, whether or not it succeeded.
const CALLBACK_PARAMS = ['code', 'state', 'session_state', 'iss', 'error', 'error_description', 'error_uri'];

// Same test as react-oidc-context's hasAuthParams, so an app param that merely shares a name (a lone
// `state`, say) is left alone.
function isCallbackQuery(params: URLSearchParams): boolean {
  return !!(params.get('code') || params.get('error')) && !!params.get('state');
}

export function hasCallbackParams(): boolean {
  return isCallbackQuery(new URLSearchParams(window.location.search));
}

// The current path without any sign-in callback params. A URL that still carries them makes the
// next load replay a callback that was already consumed, which fails and leaves the stored session
// unread.
export function getCurrentPath(): string {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  if (!isCallbackQuery(params)) return pathname + search + hash;
  CALLBACK_PARAMS.forEach(name => params.delete(name));
  const query = params.toString();
  return pathname + (query ? `?${query}` : '') + hash;
}

// Returns the path to restore, or undefined unless it is a same-origin path.
export function getReturnTo(state: unknown): string | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const { returnTo } = state as Partial<SigninState>;
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/')) return undefined;
  // "//host" and "/\host" are protocol-relative, i.e. another origin.
  if (returnTo.startsWith('//') || returnTo.startsWith('/\\')) return undefined;
  return returnTo;
}
