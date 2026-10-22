# Authentication

Three authentication options are provided:

1. `none`: authentication is disabled
2. `password`: `super-admin` and `data-admin` roles are linked to passwords stored in environment variables
3. `oidc`: environment variables are pointing to an external OIDC Identity Provider

## `none`
Platform is in read-only mode. All token protected endpoints are not reachable.

## `password`
Basic support for `super-admin` and `data-admin` roles with hardcoded passwords.
No user support is provided.

Tokens are signed with ES256, and `GET /.well-known/jwks.json` publishes the public key, so a gateway can verify them (e.g. an Envoy Gateway `SecurityPolicy` JWT provider with `issuer: soilhive-core` and `remoteJWKS` pointed at that URL):

- The key is derived from `SELF_SIGNING_SECRET`. Rotating the secret rotates the key and signs everyone out.
- In other modes the endpoint returns 404.
- See `docs/adr/0060-password-grant-tokens-are-es256-with-a-key-derived-from-the-signing-secret.md`.

## `oidc`
An external identity provider (IDP) will be used to generate tokens and define users and roles.
Frontend will receive the login configuration from this backend.

## Token scopes
Platform supports two built-in scopes:

1. `super-admin`
2. `data-admin`

Endpoints may require a specific scope to return a successful response.

## Setup

### Password-Based Authentication
Set the following backend environment variables to enable password authentication:

- `SUPER_ADMIN_PASSWORD_HASH`: bcrypt hash of password required to access the admin section
- `DATA_ADMIN_PASSWORD_HASH`: bcrypt hash of password required to manage data
- `SELF_SIGNING_SECRET`: secret used to sign authentication tokens. Use a long random string: the published token key is derived from it, so a guessable secret can be brute-forced offline

### OIDC Authentication
Set the following backend environment variables to enable OIDC authentication (see below for an exampe on how to setup an oidc provider):

- `OIDC_AUTHORITY`: Identity provider URL (e.g., `https://<BASE_KEYCLOAK_URL>/realms/<realm>` for Keycloak)
- `OIDC_CLIENT_ID`: Client name as configured in your identity provider
- `OIDC_REDIRECT_URI`: URL the identity provider redirects to after login, typically the app main page (e.g., `http://<BASE_APP_URL>`). The app then returns the user to the page they logged in from
- `OIDC_POST_LOGOUT_REDIRECT_URI`: URL to redirect after logout (typically the app main page)
- `OIDC_SILENT_REDIRECT_URI`: URL to redirect after token refresh (typically the app main page)
- `OIDC_SCOPE`: Set to `openid`
- `OIDC_ISSUER` (optional): other `iss` values the identity provider's access tokens may carry, besides `OIDC_AUTHORITY`. A comma-separated list, for a provider reached under several hostnames, for example an in-cluster address that Machine callers get their tokens from. Every token's `iss` must be `OIDC_AUTHORITY` or one of these, with or without a trailing slash; `OIDC_AUTHORITY` stays accepted, so listing another issuer never refuses the browser's tokens
- `OIDC_AUDIENCE` (optional, recommended): the `aud` values an access token for this API may carry, comma-separated. Without it, a token the identity provider issued to any client of the realm is accepted, and the backend logs a warning at startup. In Keycloak, add an *Audience* mapper to the client (see [Keycloak setup](keycloak-setup.md)), and make sure the clients of Machine callers carry the same audience

Users must belong to the realm `OIDC_AUTHORITY` points to, and need the `super-admin` (or `data-admin`) role to access the application as admin.

- [Keycloak setup](keycloak-setup.md): Example setup for Keycloak IDP and OIDC authentication

### Issuer and audience

Every token is checked for its issuer, `iss` (`docs/adr/0064`):

| Token | `iss` must be | `aud` |
| --- | --- | --- |
| Password-grant and internal-request tokens | `soilhive-core` | Not checked: their keys sign nothing else |
| Identity provider tokens | `OIDC_AUTHORITY`, or one of `OIDC_ISSUER` | One of `OIDC_AUDIENCE`, once it is set |

If neither `OIDC_ISSUER` nor `OIDC_AUTHORITY` is set, every identity provider token is refused rather than accepted unchecked. Before turning the audience check on, decode a real access token from each kind of caller (browser sign-in and each Machine caller) and check its `iss` and `aud`.

### Authentication Priority
- If both password and OIDC variables are set, **OIDC takes precedence**
- If no variables are set or only partially configured, **no authentication will be enabled**

## Token claims

Beyond signature and scope validation, the platform reads three claims off the **access token** to
decide what identity a caller acts under (its *Subject*). The Subject is what entitlements are
granted to and what every `created_by` record holds, so an identity provider that does not emit
these claims will authenticate callers correctly and still fail to authorise them as intended.

| Claim | Read for | If absent |
| --- | --- | --- |
| `email` | The Subject of a person | Entitlements granted to an email address never match anyone. Logins still work; access grants silently do nothing. The admin console warns on the dataset settings page when it detects this. |
| `gty` | Recognising a machine caller — a token obtained through the `client_credentials` grant | The caller is treated as a person, so a machine keys on `sub` instead of `client_id`. Entitlements must then be granted to that `sub`. |
| `client_id` | The Subject of a machine caller | The machine keys on its `sub`. |

Notes:

- These are claims of the **access token**, not of the id_token. Most providers populate the
  id_token from the `email` scope but need a separate, provider-specific mapping to put `email`
  into the access token as well. Keycloak: add a *User Property* mapper for `email` on the client
  and enable **Add to access token**.
- `gty` is not a standard JWT access-token claim. Keycloak and Auth0 emit it; many providers do
  not. Only the exact value `client_credentials` is recognised.
- A machine caller's `email`, if its service-account record has one, is deliberately ignored — its
  identity is the client, so that an edit to the service account in the identity provider cannot
  move the machine's entitlements.
- `email_verified` is not consulted anywhere. The identity provider is trusted to issue truthful
  email claims; see `docs/adr/0022-identity-is-the-subject-not-the-token-sub.md`.
