# Tokens are checked for their issuer and audience

**Status:** Accepted (SP-5528). The audience check takes effect on each deployment once `OIDC_AUDIENCE` is set.

Until now the token validator checked a token's signature, expiry, `sub` and scopes, but never `iss` or `aud`. In OIDC mode, that means the core accepts any token its identity provider signs: a token the realm issued to another client, for another API, works on the core with whatever roles it carries. In password mode the core's own keys sign only its own tokens, so the gap there was theoretical.

Every token is now checked for its issuer, chosen by the key that verifies it (ADR 0060 dispatches on `kid`):

| Token             | `iss` must be                                                                                   | `aud`                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Password-grant    | `soilhive-core`                                                                                 | Not checked                                              |
| Internal-request  | `soilhive-core`                                                                                 | Not checked                                              |
| Identity provider | One of `OIDC_ISSUER` (comma-separated), else `OIDC_AUTHORITY`, with or without a trailing slash | One of `OIDC_AUDIENCE` (comma-separated), once it is set |

- **Platform-issued tokens are checked for `iss` only.** Their keys sign nothing else, so an audience would add nothing. Every Password-grant and internal-request token already carries `iss: soilhive-core`, so nobody has to sign in again.
- **`OIDC_ISSUER` is a list.** An identity provider reached under several hostnames, an in-cluster one for Machine callers say, can stamp a different `iss` on each. Without `OIDC_ISSUER`, `OIDC_AUTHORITY` is the issuer the browser signs in with.
- **The issuer check fails closed.** With neither `OIDC_ISSUER` nor `OIDC_AUTHORITY` set, every IdP token is refused (401). jsonwebtoken skips the check when the issuer is `undefined`, so an unset value must never reach it.
- **The audience check waits for `OIDC_AUDIENCE`.** Keycloak access tokens carry `aud: account` unless an _Audience_ mapper adds the client, and each Machine caller's client needs the same mapper. Requiring it on deploy would sign everyone out until each realm is changed. Until it is set, the backend logs a warning at startup.

## Considered options

- **Require `OIDC_AUDIENCE` at once.** It closes the gap on deploy, but signs everyone out on every realm whose tokens lack the audience, with no way back but a config change. Rejected for the rollout; it can become required once every environment sets it.
- **Default the audience to `OIDC_CLIENT_ID`.** That is the client the browser signs in with, not necessarily an audience its tokens carry, and never the one of a Machine caller's tokens. Rejected.
- **Check `azp` instead of `aud`.** `azp` names the client the token was issued to, which differs per Machine caller, so the check would need the same list of clients. `aud` is the standard claim for "meant for this API". Rejected.
- **An `aud` on platform-issued tokens.** Each of their keys signs one kind of token, so it would separate nothing. Not done.

## Consequences

- A deployment whose `OIDC_AUTHORITY` differs from the `iss` its tokens carry (another hostname, a trailing path) refuses every IdP token until `OIDC_ISSUER` lists the right value. Before deploying, decode a real access token from the browser and from each Machine caller.
- Until `OIDC_AUDIENCE` is set, a token issued to any client of the realm is still accepted. The startup warning says so.
- The quickstart realm's `soilhive` client gains an Audience mapper, so a freshly imported realm's tokens carry `aud: soilhive`. A realm imported before keeps working, since the quickstart does not set `OIDC_AUDIENCE`.
