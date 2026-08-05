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
