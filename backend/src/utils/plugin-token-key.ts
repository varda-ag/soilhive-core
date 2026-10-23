import jwt from 'jsonwebtoken';
import { TokenScopes } from '../types/enums';
import { log } from './logger';
import { deriveEs256Key, Es256Key } from './password-grant-key';

// Plugin tokens are ES256 with a key derived from PLUGIN_TOKEN_SECRET, never from SELF_SIGNING_SECRET
// (see docs/adr/0063). Changing INFO or the secret rotates the key: Plugin Backends then reject the
// tokens already handed out, and the host mints new ones on the 401.
const INFO = 'plugin-token-es256';

export const PLUGIN_TOKEN_TYPE = 'plugin+jwt';
export const PLUGIN_TOKEN_TTL_SECONDS = 300;
export const MIN_PLUGIN_TOKEN_SECRET_LENGTH = 32;
export const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const AUDIENCE_PREFIX = 'plugin:';
export const PLUGIN_AUDIENCE_PATTERN = new RegExp(`^${AUDIENCE_PREFIX}${PLUGIN_ID_PATTERN.source.slice(1)}`);

let cached: { secret: string; key: Es256Key } | undefined = undefined;
const warned = new Set<string>();

// Settings are read on every call, never at module load, so a change of env in a test applies at once
const warnOnce = (message: string): void => {
  if (!warned.has(message)) {
    warned.add(message);
    log.warn(message);
  }
};

/**
 * The key that signs Plugin tokens, or `undefined` when PLUGIN_TOKEN_SECRET is unset or too short.
 * Never throws: the token validator looks it up for every token, in every auth mode.
 */
export const getPluginTokenKey = (): Es256Key | undefined => {
  const secret = process.env.PLUGIN_TOKEN_SECRET;
  if (!secret) {
    return undefined;
  }
  if (secret.length < MIN_PLUGIN_TOKEN_SECRET_LENGTH) {
    warnOnce(`PLUGIN_TOKEN_SECRET is shorter than ${MIN_PLUGIN_TOKEN_SECRET_LENGTH} characters: Plugin tokens are disabled`);
    return undefined;
  }
  if (cached?.secret !== secret) {
    cached = { secret, key: deriveEs256Key(secret, INFO) };
  }
  return cached.key;
};

/**
 * The `iss` of every Plugin token: CORE_PUBLIC_URL, the core's public API base (the frontend's
 * BACKEND_BASE_URL), without a trailing slash. `undefined` when it is unset or not an http(s) URL.
 */
export const getPluginTokenIssuer = (): string | undefined => {
  // Trimmed as URL parsing trims it: a trailing newline from a secret file would end up in `iss`
  const value = process.env.CORE_PUBLIC_URL?.trim();
  if (!value) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    warnOnce('CORE_PUBLIC_URL is not a URL: Plugin tokens are disabled');
    return undefined;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    warnOnce('CORE_PUBLIC_URL must be an http(s) URL with no credentials, query or fragment: Plugin tokens are disabled');
    return undefined;
  }
  return value.replace(/\/+$/, '');
};

/** The pluginIds whose Plugin tokens keep the user's admin scopes (PLUGIN_TOKEN_ADMIN_PLUGINS). */
export const getAdminPluginIds = (): Set<string> => {
  const ids = (process.env.PLUGIN_TOKEN_ADMIN_PLUGINS ?? '').split(',').map(id => id.trim());
  return new Set(ids.filter(id => PLUGIN_ID_PATTERN.test(id)));
};

/**
 * Keeps only the admin scopes a Plugin token may carry, matched as whole words, never
 * internal-request. An array, which some identity providers send, is read as the list it is.
 */
export const pluginTokenScope = (scope: unknown): string => {
  const scopes: unknown[] = Array.isArray(scope) ? scope : typeof scope === 'string' ? scope.split(/\s+/) : [];
  return [TokenScopes.SUPER_ADMIN, TokenScopes.DATA_ADMIN].filter(s => scopes.includes(s)).join(' ');
};

export const pluginAudience = (pluginId: string): string => `${AUDIENCE_PREFIX}${pluginId}`;

/** The pluginId named by a verified Plugin token's `aud`, which must be one string. */
export const pluginIdFromAudience = (aud: unknown): string | undefined => {
  if (typeof aud !== 'string' || !PLUGIN_AUDIENCE_PATTERN.test(aud)) {
    return undefined;
  }
  return aud.slice(AUDIENCE_PREFIX.length);
};

/** Signs a Plugin token. The payload carries `iss`, `aud`, `sub`, `exp` and `jti` itself. */
export const signPluginToken = (key: Es256Key, payload: object): string => {
  return jwt.sign(payload, key.privateKey, { algorithm: 'ES256', keyid: key.kid, header: { alg: 'ES256', typ: PLUGIN_TOKEN_TYPE } });
};
