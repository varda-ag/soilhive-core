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
const WINDOW_MS = 60_000;

/**
 * Mints so far in the current window, per Subject and pluginId. Per process: with several
 * replicas the limit applies to each. Keyed by pluginId too, because in password mode every user
 * of a role shares one Subject, and a Plugin Backend that keeps answering 401 should not stop the
 * user's other plugins from getting tokens.
 */
const mintCounts = new LRUCache<string, number>({ max: 10_000, ttl: WINDOW_MS, noUpdateTTL: true });

/** Test hook: forget every mint counted so far. */
export const resetPluginTokenRateLimit = (): void => {
  mintCounts.clear();
};

export class TooManyMintsError extends ErrorResponse {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many Plugin tokens requested, try again later', StatusCodes.TOO_MANY_REQUESTS);
  }
}

export default class PluginTokenService {
  /**
   * A Plugin token for the caller and one plugin (see docs/adr/0063): signed with the plugin key,
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

  /** The keys Plugin Backends verify Plugin tokens with. Never lists a key that verifies user tokens. */
  getJwks = (): { keys: PublicJwk[] } => {
    const key = getPluginTokenKey();
    if (!key) {
      throw new ErrorResponse('Plugin tokens are not configured on this deployment', StatusCodes.NOT_FOUND);
    }
    return { keys: [key.jwk] };
  };

  private countMint = (subject: string, pluginId: string): void => {
    const counter = `${subject}\n${pluginId}`;
    const count = (mintCounts.get(counter) ?? 0) + 1;
    mintCounts.set(counter, count);
    if (count > MINTS_PER_WINDOW) {
      const remainingMs = mintCounts.getRemainingTTL(counter);
      throw new TooManyMintsError(Math.max(Math.ceil(remainingMs / 1000), 1));
    }
  };
}
