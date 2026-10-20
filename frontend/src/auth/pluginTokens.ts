import { BACKEND_BASE_URL, REST_END_POINTS } from 'configuration/api';
import { httpClient } from '../api-client/httpClient';
import { getToken } from './tokenStore';

// Plugin tokens (docs/adr/0063): a short-lived token the core mints for one plugin and the signed-in
// user. usePluginApi sends it to that plugin's own backend instead of the user's token, which never
// leaves for a Plugin Backend. Kept in memory only, per pluginId, for the user token they were
// minted with: a renewed user token, a sign-out or another user starts over.

// Renewed this long before it expires, or at half its life when that is shorter
const RENEW_MARGIN_MS = 30_000;
// A token this young that a Plugin Backend rejects is not renewed: the backend is refusing every
// token (a wrong SOILHIVE_CORE_URL, say), and renewing would only spend the mint limit
const MIN_AGE_TO_RENEW_MS = 10_000;

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

// An error whose status a PluginApiError keeps
const userChangedError = () => Object.assign(new Error('The signed-in user changed during the call'), { status: 401 });

/** Starts over when the user token is not the one the cache was filled for. */
const currentOwner = (): string | null => {
  const userToken = getToken();
  if (userToken !== owner) {
    tokens.clear();
    mints.clear();
    owner = userToken;
  }
  return userToken;
};

// One mint per plugin at a time, shared by every caller and never aborted by one of them
const mint = (pluginId: string, mintOwner: string): Promise<MintedToken> => {
  const running = mints.get(pluginId);
  if (running) {
    return running;
  }
  const pending: Promise<MintedToken> = httpClient<MintResponse>({
    url: `${BACKEND_BASE_URL}/${REST_END_POINTS.PLUGINS}/${encodeURIComponent(pluginId)}/token`,
    method: 'POST',
  })
    .then(({ access_token, expires_in }) => {
      const mintedAt = Date.now();
      const lifetime = expires_in * 1000;
      const minted = { token: access_token, mintedAt, renewAt: mintedAt + lifetime - Math.min(RENEW_MARGIN_MS, lifetime / 2) };
      if (owner === mintOwner) {
        tokens.set(pluginId, minted);
      }
      return minted;
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
  const minted = await untilAborted(mint(pluginId, mintOwner), signal);
  if (getToken() !== mintOwner) {
    throw userChangedError();
  }
  return minted.token;
};

/**
 * The Plugin token to send to pluginId's backend, or null for an anonymous visitor, who never
 * reaches the core for one. Rejects with the mint call's error.
 */
export const getPluginToken = async (pluginId: string, signal?: AbortSignal): Promise<string | null> => {
  if (typeof window === 'undefined') {
    return null; // a module-level cache on the server would be shared between users
  }
  const userToken = currentOwner();
  if (!userToken) {
    return null;
  }
  const cached = tokens.get(pluginId);
  if (cached && Date.now() < cached.renewAt) {
    return cached.token;
  }
  return mintFor(pluginId, userToken, signal);
};

/**
 * A token to retry with after pluginId's backend answered 401 to `rejected`: the one another call
 * already renewed, or a new one. null when the call should give up and surface the 401.
 */
export const renewPluginToken = async (pluginId: string, rejected: string, signal?: AbortSignal): Promise<string | null> => {
  if (typeof window === 'undefined') {
    return null;
  }
  const userToken = currentOwner();
  if (!userToken) {
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
  return mintFor(pluginId, userToken, signal);
};

/** Test hook: forget every Plugin token and every mint in progress. */
export const resetPluginTokens = (): void => {
  tokens.clear();
  mints.clear();
  owner = null;
};
