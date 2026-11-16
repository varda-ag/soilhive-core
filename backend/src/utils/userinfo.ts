import { StatusCodes } from 'http-status-codes';
import { Token } from '../interfaces/Token';
import { ErrorResponse, getErrorMessage } from './error';
import { log } from './logger';

const TIMEOUT_MS = 5000;

// The userinfo endpoint from the identity provider's discovery document, looked up once per authority
let discovered: { authority: string; endpoint: Promise<string> } | undefined;

const userinfoEndpoint = (authority: string): Promise<string> => {
  if (discovered?.authority !== authority) {
    const endpoint = fetch(`${authority.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then(async response => {
      if (!response.ok) {
        throw new Error(`discovery returned ${response.status}`);
      }
      const { userinfo_endpoint } = (await response.json()) as { userinfo_endpoint?: unknown };
      if (typeof userinfo_endpoint !== 'string') {
        throw new Error('discovery names no userinfo_endpoint');
      }
      return userinfo_endpoint;
    });
    // A failed lookup is tried again next time
    endpoint.catch(() => {
      if (discovered?.endpoint === endpoint) {
        discovered = undefined;
      }
    });
    discovered = { authority, endpoint };
  }
  return discovered.endpoint;
};

/** Test hook: forget the discovered endpoint. */
export const resetUserinfoEndpoint = (): void => {
  discovered = undefined;
};

/** A claim's email, or undefined when absent or blank: some providers send an empty string. */
export const emailClaim = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * The email the identity provider holds for the person behind `token`, from its userinfo endpoint.
 * Only for matching an Invite's recipient, never a Subject (docs/adr/0081). Undefined without an
 * OIDC provider; a 502 when the provider can't be asked or answers for another `sub`.
 */
export const getUserinfoEmail = async (token: Token): Promise<string | undefined> => {
  const authority = process.env.OIDC_AUTHORITY;
  if (!authority) {
    return undefined;
  }
  try {
    const response = await fetch(await userinfoEndpoint(authority), {
      headers: { Authorization: `Bearer ${token.raw}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`userinfo returned ${response.status}`);
    }
    const claims = (await response.json()) as { sub?: unknown; email?: unknown };
    if (claims.sub !== token.sub) {
      throw new Error('userinfo answered for another sub');
    }
    return emailClaim(claims.email);
  } catch (error) {
    log.warn('Could not read the email from the identity provider', { error: getErrorMessage(error) });
    throw new ErrorResponse('Could not confirm your email with the identity provider. Try again later.', StatusCodes.BAD_GATEWAY);
  }
};
