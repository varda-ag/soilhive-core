// Where an OIDC sign-in started, so the callback can put the user back there.
// It travels in the sign-in's custom `state`, which oidc-client-ts keeps in
// browser storage rather than in the URL, so a crafted link cannot set it.

export type SigninState = { returnTo: string };

export function getCurrentPath(): string {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
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
