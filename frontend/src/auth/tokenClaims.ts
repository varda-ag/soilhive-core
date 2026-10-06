import { jwtDecode } from 'jwt-decode';

/**
 * Reads the `email` claim out of an access token, or undefined if it carries none.
 *
 * Deliberately decodes the access token rather than reading react-oidc-context's
 * `user.profile.email`: profile is assembled from the id_token and /userinfo, whereas the backend
 * resolves the Subject from the access token (`getSubject`, backend `src/utils/auth.ts`). The
 * `email` scope's defined effect is to populate the id_token — emitting `email` in the access
 * token is a separate, IdP-specific claim mapping — so `profile.email` is typically present on
 * exactly the deployments whose access tokens carry no email, and substituting it would turn any
 * check built on this into a false reassurance. See ADR 0022.
 *
 * The signature is not verified, and does not need to be: the result only ever hides or annotates
 * UI. Every action it gates is independently authorised server-side against a JWKS-verified token.
 */
export function getEmailFromAccessToken(accessToken: string | undefined): string | undefined {
  if (!accessToken) return undefined;
  try {
    const { email } = jwtDecode<{ email?: unknown }>(accessToken);
    // Some IdPs emit an empty string when the attribute is unset; that is not an available email.
    return typeof email === 'string' && email.trim().length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

const EXPIRY_BUFFER_MS = 30_000;

/**
 * Whether an access token is expired or within 30s of it. An undecodable token counts as expired; one
 * without an `exp` claim does not. Shared by the SSR server and the hydrated page so both reach the
 * same answer. Unverified signature, as above: the backend rejects a tampered token.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = jwtDecode(token);
    return !!exp && exp * 1000 <= Date.now() + EXPIRY_BUFFER_MS;
  } catch {
    return true;
  }
}
