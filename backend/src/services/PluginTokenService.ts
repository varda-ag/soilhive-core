import { randomUUID } from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { LRUCache } from 'lru-cache';
import { RequestData } from '../interfaces/RequestData';
import { TokenResponse } from '../interfaces/Token';
import { getSubject } from '../utils/auth';
import { ErrorResponse } from '../utils/error';
import { PublicJwk } from '../utils/password-grant-key';
import {
  getAdminPluginIds,
  getPluginTokenIssuer,
  getPluginTokenKey,
  PLUGIN_TOKEN_TTL_SECONDS,
  pluginAudience,
  pluginTokenScope,
  signPluginToken,
} from '../utils/plugin-token-key';

export const MINTS_PER_WINDOW = 30;
export const MINTS_PER_SUBJECT_PER_WINDOW = 120;
const WINDOW_MS = 60_000;

/**
 * Mints so far in the current window, per process: with several replicas the limits apply to
 * each. Per Subject and pluginId, so a Plugin Backend that keeps answering 401 does not stop the
 * user's other plugins from getting tokens; and per Subject across every pluginId, because any
 * well-formed pluginId is accepted and the first limit alone would not bound a caller.
 */
const pluginMintCounts = new LRUCache<string, number>({ max: 10_000, ttl: WINDOW_MS, noUpdateTTL: true });
const subjectMintCounts = new LRUCache<string, number>({ max: 10_000, ttl: WINDOW_MS, noUpdateTTL: true });

/** Test hook: forget every mint counted so far. */
export const resetPluginTokenRateLimit = (): void => {
  pluginMintCounts.clear();
  subjectMintCounts.clear();
};

const assertWithin = (counts: LRUCache<string, number>, key: string, limit: number): void => {
  if ((counts.get(key) ?? 0) >= limit) {
    throw new TooManyMintsError(Math.max(Math.ceil(counts.getRemainingTTL(key) / 1000), 1));
  }
};

const count = (counts: LRUCache<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

export class TooManyMintsError extends ErrorResponse {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many Plugin tokens requested, try again later', StatusCodes.TOO_MANY_REQUESTS);
  }
}

export default class PluginTokenService {
  /**
   * A Plugin token for the caller and one plugin (see docs/adr/0065): signed with the plugin key,
   * `aud` names the plugin, `sub` is the caller's Subject, and it never outlives the caller's token.
   */
  mint = (requestData: RequestData, pluginId: string): TokenResponse => {
    const token = requestData.token;
    if (!token) {
      throw new ErrorResponse('A signed-in user is required', StatusCodes.UNAUTHORIZED);
    }
    if (token.isInternalRequest || token.pluginId) {
      throw new ErrorResponse('Only a signed-in user can get a Plugin token', StatusCodes.FORBIDDEN);
    }
    const key = getPluginTokenKey();
    const issuer = getPluginTokenIssuer();
    if (!key || !issuer) {
      throw new ErrorResponse('Plugin tokens are not configured on this deployment', StatusCodes.SERVICE_UNAVAILABLE);
    }
    const subject = getSubject(requestData);
    this.countMint(subject, pluginId);

    const now = Math.floor(Date.now() / 1000);
    const exp = Math.min(now + PLUGIN_TOKEN_TTL_SECONDS, token.exp ?? Infinity);
    const scope = getAdminPluginIds().has(pluginId) ? pluginTokenScope(token.scope) : '';
    const payload = {
      iss: issuer,
      aud: pluginAudience(pluginId),
      sub: subject,
      iat: now,
      exp,
      jti: randomUUID(),
      ...(scope ? { scope } : {}),
    };
    return { access_token: signPluginToken(key, payload), token_type: 'Bearer', expires_in: Math.max(exp - now, 0) };
  };

  /**
   * The keys Plugin Backends verify Plugin tokens with. Never lists a key that verifies user tokens.
   * None without a valid CORE_PUBLIC_URL either: the core then neither mints nor accepts Plugin tokens.
   */
  getJwks = (): { keys: PublicJwk[] } => {
    const key = getPluginTokenKey();
    if (!key || !getPluginTokenIssuer()) {
      throw new ErrorResponse('Plugin tokens are not configured on this deployment', StatusCodes.NOT_FOUND);
    }
    return { keys: [key.jwk] };
  };

  // Both limits are checked before either counts: a refused mint spends no budget, so a plugin over
  // its own limit never uses up the Subject's and stops the user's other plugins
  private countMint = (subject: string, pluginId: string): void => {
    const pluginKey = `${subject}\n${pluginId}`;
    assertWithin(subjectMintCounts, subject, MINTS_PER_SUBJECT_PER_WINDOW);
    assertWithin(pluginMintCounts, pluginKey, MINTS_PER_WINDOW);
    count(subjectMintCounts, subject);
    count(pluginMintCounts, pluginKey);
  };
}
