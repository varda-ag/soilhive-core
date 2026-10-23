import { log } from './logger';

// Which issuer and audience a user token must carry (docs/adr/0064). Read on every call, never at
// module load, so a change of env in a test applies at once.

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

/**
 * The `iss` an identity provider's token may carry: OIDC_AUTHORITY, the issuer the browser signs in
 * with, plus OIDC_ISSUER, a comma-separated list for an IdP reached under other hostnames too. Added,
 * never replaced, so listing a Machine caller's issuer can't refuse the browser's tokens. Each with
 * and without a trailing slash. Empty when neither is set: the validator then refuses every IdP token.
 */
export const getOidcIssuers = (): string[] => {
  const issuers = [...list(process.env.OIDC_AUTHORITY), ...list(process.env.OIDC_ISSUER)];
  return [...new Set(issuers.flatMap(issuer => [issuer.replace(/\/+$/, ''), `${issuer.replace(/\/+$/, '')}/`]))];
};

/** The `aud` values an IdP token may carry (OIDC_AUDIENCE), or `undefined` while it is unset. */
export const getOidcAudiences = (): [string, ...string[]] | undefined => {
  const [first, ...rest] = list(process.env.OIDC_AUDIENCE);
  return first ? [first, ...rest] : undefined;
};

/** Once, at startup: an OIDC deployment without OIDC_AUDIENCE accepts any client's token. */
export const warnIfOidcAudienceUnchecked = (): void => {
  if (!getOidcAudiences()) {
    log.warn(
      'OIDC_AUDIENCE is unset: tokens the identity provider issued to any client of the realm are accepted. Set it only once your access tokens carry an audience, or every sign-in is refused (docs/adr/0064)',
    );
  }
};
