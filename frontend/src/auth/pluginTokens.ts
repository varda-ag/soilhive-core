import { jwtDecode } from 'jwt-decode';
import { BACKEND_BASE_URL, REST_END_POINTS } from 'configuration/api';
import { httpClient } from '../api-client/httpClient';
import { getToken } from './tokenStore';
import { isTokenExpired } from './tokenClaims';
import { refreshAccessToken } from './tokenRefresher';

// Plugin tokens (docs/adr/0065): a short-lived token the core mints for one plugin and the signed-in
// user. usePluginApi sends it to that plugin's own backend instead of the user's token, which never
// leaves for a Plugin Backend. Kept in memory only, per pluginId, for the user they were minted for:
// a silent renew of the user's token keeps them, a sign-out or another user starts over.

// Renewed this long before it expires, or at half its life when that is shorter
const RENEW_MARGIN_MS = 30_000;
// A token this young that a Plugin Backend rejects is not renewed: the backend is refusing every
// token (a wrong SOILHIVE_CORE_URL, say), and renewing would only spend the mint limit
const MIN_AGE_TO_RENEW_MS = 10_000;
// How long a 429 without a usable Retry-After holds off the next mint
const DEFAULT_RETRY_AFTER_MS = 10_000;

interface MintedToken {
  token: string;
  mintedAt: number;
  renewAt: number; // local clock, from expires_in: the browser's clock may disagree with the token's exp
}

interface MintResponse {
  access_token: string;
  expires_in: number;
}

let owner: string | null = null;
const tokens = new Map<string, MintedToken>();
const mints = new Map<string, Promise<MintedToken>>();
const refusals = new Map<string, { error: unknown; until: number }>();

// An error whose status a PluginApiError keeps
const userChangedError = () => Object.assign(new Error('The signed-in user changed during the call'), { status: 401 });

/**
 * Who the signed-in user is, as far as Plugin tokens go: the user token's issuer and `sub`, so a
 * renewed token of the same user keeps the cache. The raw token when it can't be decoded. null for
 * an anonymous visitor. Unverified, as tokenClaims.ts explains: the core checks the token it mints with.
 */
export const getPluginTokenOwner = (): string | null => {
  const userToken = getToken();
  if (!userToken) {
    return null;
  }
  try {
    const { iss, sub } = jwtDecode<{ iss?: string; sub?: string }>(userToken);
    return sub ? `${iss ?? ''}\n${sub}` : userToken;
  } catch {
    return userToken;
  }
};

/** Starts over when the signed-in user is not the one the cache was filled for. */
const currentOwner = (): string | null => {
  const userOwner = getPluginTokenOwner();
  if (userOwner !== owner) {
    tokens.clear();
    mints.clear();
    refusals.clear();
    owner = userOwner;
  }
  return userOwner;
};

// A 429 holds off every mint for the plugin until its Retry-After: asking sooner only gets another
// one, and a plugin that keeps calling its backend would otherwise ask on every call
const rememberRefusal = (pluginId: string, error: unknown): void => {
  const { status, retryAfter } = (error ?? {}) as { status?: number; retryAfter?: string | null };
  if (status !== 429) {
    return;
  }
  const seconds = Number(retryAfter);
  const wait = retryAfter && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
  refusals.set(pluginId, { error, until: Date.now() + wait });
};

// The core never mints past the user token's expiry, so a nearly expired one would give a token
// that lives seconds and is minted again on every call. Renew it first: a no-op without OIDC.
const renewUserTokenIfExpiring = async (): Promise<void> => {
  const userToken = getToken();
  if (userToken && isTokenExpired(userToken)) {
    await refreshAccessToken().catch(() => undefined);
  }
};

// One mint per plugin at a time, shared by every caller and never aborted by one of them
const mint = (pluginId: string, mintOwner: string): Promise<MintedToken> => {
  const running = mints.get(pluginId);
  if (running) {
    return running;
  }
  const pending: Promise<MintedToken> = renewUserTokenIfExpiring()
    .then(() =>
      httpClient<MintResponse>({
        url: `${BACKEND_BASE_URL}/${REST_END_POINTS.PLUGINS}/${encodeURIComponent(pluginId)}/token`,
        method: 'POST',
      }),
    )
    .then(({ access_token, expires_in }) => {
      const mintedAt = Date.now();
      const lifetime = expires_in * 1000;
      const minted = { token: access_token, mintedAt, renewAt: mintedAt + lifetime - Math.min(RENEW_MARGIN_MS, lifetime / 2) };
      if (owner === mintOwner) {
        tokens.set(pluginId, minted);
      }
      return minted;
    })
    .catch(error => {
      if (owner === mintOwner) {
        rememberRefusal(pluginId, error);
      }
      throw error;
    })
    .finally(() => {
      if (mints.get(pluginId) === pending) {
        mints.delete(pluginId);
      }
    });
  mints.set(pluginId, pending);
  return pending;
};

// The caller stops waiting on abort; the shared mint goes on for the others
const untilAborted = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

const mintFor = async (pluginId: string, mintOwner: string, signal?: AbortSignal): Promise<string> => {
  const refusal = refusals.get(pluginId);
  if (refusal && Date.now() < refusal.until) {
    throw refusal.error;
  }
  const minted = await untilAborted(mint(pluginId, mintOwner), signal);
  if (getPluginTokenOwner() !== mintOwner) {
    throw userChangedError();
  }
  return minted.token;
};

/**
 * The Plugin token to send to pluginId's backend, or null for an anonymous visitor, who never
 * reaches the core for one. Rejects with the mint call's error, and with a 429 again, without
 * asking, until its Retry-After has passed.
 */
export const getPluginToken = async (pluginId: string, signal?: AbortSignal): Promise<string | null> => {
  if (typeof window === 'undefined') {
    return null; // a module-level cache on the server would be shared between users
  }
  const userOwner = currentOwner();
  if (!userOwner) {
    return null;
  }
  const cached = tokens.get(pluginId);
  if (cached && Date.now() < cached.renewAt) {
    return cached.token;
  }
  return mintFor(pluginId, userOwner, signal);
};

/**
 * A token to retry with after pluginId's backend answered 401 to `rejected`: the one another call
 * already renewed, or a new one. null when the call should give up and surface the 401.
 */
export const renewPluginToken = async (pluginId: string, rejected: string, signal?: AbortSignal): Promise<string | null> => {
  if (typeof window === 'undefined') {
    return null;
  }
  const userOwner = currentOwner();
  if (!userOwner) {
    return null;
  }
  const cached = tokens.get(pluginId);
  if (cached && cached.token !== rejected && Date.now() < cached.renewAt) {
    return cached.token;
  }
  if (cached?.token === rejected && Date.now() - cached.mintedAt < MIN_AGE_TO_RENEW_MS) {
    return null;
  }
  tokens.delete(pluginId);
  return mintFor(pluginId, userOwner, signal);
};

/** Test hook: forget every Plugin token and every mint in progress. */
export const resetPluginTokens = (): void => {
  tokens.clear();
  mints.clear();
  refusals.clear();
  owner = null;
};
