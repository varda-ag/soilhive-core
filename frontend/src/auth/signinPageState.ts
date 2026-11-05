import { useEffect, useState } from 'react';

// What a page hands to an OIDC sign-in so it can be put back after the reload the sign-in causes, as the
// legacy platform kept its map selection across a login (docs/adr/0075). Keyed by whoever puts it back.
// It travels in the sign-in's custom `state`, beside `returnTo`, so only a sign-in that succeeded brings
// it back: one abandoned at the identity provider leaves nothing behind to restore later.
export type SigninPageState = Record<string, unknown>;

// Set on the sign-in callback, before the app mounts, and kept for this page load only
let restored: SigninPageState = {};

export function getPageState(state: unknown): SigninPageState | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const { pageState } = state as { pageState?: unknown };
  if (!pageState || typeof pageState !== 'object' || Array.isArray(pageState)) return undefined;
  return pageState as SigninPageState;
}

export function setRestoredPageState(pageState: SigninPageState | undefined): void {
  restored = { ...pageState };
}

/** The part of the restored state stored under `key`, if the sign-in that loaded this page carried one. */
export function peekRestoredPageState(key: string): unknown {
  return restored[key];
}

export function clearRestoredPageState(key: string): void {
  delete restored[key];
}

/**
 * The part of the restored state stored under `key`, read once when the component mounts and then
 * forgotten, so a later mount (the visitor leaves the map and comes back) starts afresh. Cleared in an
 * effect rather than while reading: StrictMode calls state initialisers twice and keeps either result.
 */
export function useRestoredPageState<T extends object>(key: string): Partial<T> | undefined {
  const [state] = useState(() => {
    const value = peekRestoredPageState(key);
    return value && typeof value === 'object' ? (value as Partial<T>) : undefined;
  });
  useEffect(() => clearRestoredPageState(key), [key]);
  return state;
}
