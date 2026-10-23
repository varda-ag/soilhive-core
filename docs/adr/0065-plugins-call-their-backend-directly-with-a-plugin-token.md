# Plugins call their backend directly with a Plugin token

**Status:** Accepted (SP-5528). Replaces the reverse-proxy design reviewed in PR #893, which never reached `main`.

A **Plugin** may have a **Plugin Backend**: an API its own deployment serves next to its remote. The plugin's frontend calls it straight from the browser through `context.usePluginApi(pluginId)`, and the core backend stays out of that traffic. Uploads, downloads and streaming go between the browser and the Plugin Backend. The core keeps three duties:

1. **It mints Plugin tokens.** For a signed-in user, the host calls `POST /plugins/{pluginId}/token` with the user's own token. The core signs a **Plugin token**: ES256, header `typ: plugin+jwt`, `iss` = `CORE_PUBLIC_URL`, `aud` = `plugin:{pluginId}`, `sub` = the caller's **Subject**, a `jti`, and an `exp` 5 minutes away that is never later than the user token's.
2. **It publishes their key** at `GET /.well-known/plugin-jwks.json`, in every auth mode. That set holds the plugin key only, so a Plugin Backend that trusts it can never accept a user's token.
3. **It answers reads made with them.** A Plugin Backend sends the token it received back to the core to read data as the user.

The host (`usePluginApi`, `src/auth/pluginTokens.ts`) keeps one Plugin token per plugin in memory, for the signed-in user (the user token's `iss` and `sub`), so a silent renew keeps it. It reuses the token until 30 seconds before it expires, timed on the local clock from `expires_in`, and renews a user token about to expire before minting, since the core never mints past it. When the Plugin Backend answers `401`, it mints a new one and retries the call once. It never renews, clears or sends the user's token to a Plugin Backend: a Plugin Backend cannot sign anyone out. An anonymous visitor gets no token, and its calls go out with no `Authorization`.

## Who accepts which token

| Token                              | Core API                                           | Its own Plugin Backend                      | Another Plugin Backend          |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| User token (IdP or Password-grant) | Accepted                                           | 401: its `kid` is not in the plugin key set | 401, likewise                   |
| Plugin token for `plugin:zones`    | GET only, as the user, never privileged by default | Accepted                                    | 401: `aud` names another plugin |
| No token                           | Anonymous where the route allows it                | The backend decides                         | The backend decides             |

## What the core enforces on a Plugin token

The token validator dispatches on `kid`, before the auth-mode branch, so Plugin tokens work in password and OIDC mode alike. For a Plugin token:

- **Reads only.** Any method but `GET` is a `403`. No operation declares `HEAD`, so the validator answers it `405` before any token check.
- **Never privileged by default.** `scope` is reset to empty, so `isSuperAdmin`, `isDataAdmin` and `isInternalRequest` are false and **Entitlements** apply. A deployment can list pluginIds in `PLUGIN_TOKEN_ADMIN_PLUGINS`. Their tokens then carry the user's `super-admin`/`data-admin` scopes, matched as whole words and never `internal-request`. The list is checked on every call, not only at minting, so removing a plugin takes effect at the next restart, tokens already minted included.
- **The Subject is `sub`.** `email`, `gty` and `client_id` are dropped, so `getSubject` returns `sub`, the Subject the core computed at minting.
- **Some reads refuse it.** Operations marked `x-plugin-token-denied` answer `403`, opted-in admin tokens included: `GET /configs/{configId}/entitlements` and `GET /datasets/{datasetId}/entitlements` list other Subjects' grants, `GET /files/{fileId}/download` hands out raw curation files, and `GET /data-filters` keys filters by the raw `token.sub`, so a Plugin token, whose `sub` is the Subject, would get a misleading empty list. A route test lists every `GET` against this table, so a new read is never opened to Plugin Backends by default. `GET /jobs/{jobId}` stays allowed: the signed download path it returns lives 30 seconds.
- **Every check runs before the token is attached to the request.** Seven routes declare `security: [bearerAuth, {}]`: `POST /jobs`, `DELETE /jobs/{jobId}`, `POST /data-requests`, `DELETE /data-requests/{id}`, `POST /soil-indexes`, `DELETE /soil-indexes/{runId}` and `POST /data-filters`. On them express-openapi-validator drops the security handler's error, because the empty alternative passes. The refusal then comes from `authMiddleware`, which validates the token again only when none is attached. So the token is attached only after every check has passed, and `authMiddleware` checks a Plugin token's method and route once more as a backstop.
- **External entitlements never see it.** `callEntitlementsEndpoint` returns nothing for a Plugin token: a token the core signed is never sent to a third party, which would reject it anyway (ADR 0060 already keeps raw tokens from leaving). On a deployment with `ENTITLEMENTS_ENDPOINT`, a Plugin Backend therefore reads only the user's local and `everyone` grants.
- **Logged as the plugin.** The request log carries `soilhive.plugin_id`.

## Why a dedicated secret

The plugin key is derived with HKDF, as the Password-grant key is (ADR 0060), but from a new `PLUGIN_TOKEN_SECRET` of at least 32 characters, not from `SELF_SIGNING_SECRET`. Anyone who knows the secret can mint a Plugin token for any Subject, and the published public key lets a weak secret be guessed offline. `SELF_SIGNING_SECRET` already signs internal-request tokens and download links, and is configured in more places than a key that impersonates users should be. A dedicated secret keeps those apart, can be held to a minimum length, and rotates on its own. When it or `CORE_PUBLIC_URL` is unset or invalid, the core mints nothing (`503`), publishes no key (`404`) and refuses every Plugin token (`401`). It never throws, so OIDC deployments without the secret keep working.

## Why the manifest's folder, not the origin

By default the client calls the folder that holds the plugin's `mf-manifest.json`. For a remote served at the root of its origin, that is the origin, the address this design started from. soilhive-plugins serves every plugin from one origin under its own path. With the origin as the default, every plugin's token would go to the same host, and `aud` would protect nothing there. A plugin may pass `baseUrl` to call an API elsewhere. It must be `https` (`http` on `localhost` only) with no credentials, and a path may not resolve outside it.

## Threats

- **Making the core fetch an address the caller chooses: nothing to exploit.** The core makes no outbound request for a plugin.
- **A breached Plugin Backend.** It holds Plugin tokens only, each valid for at most 5 minutes, on that backend and for reads on the core as its user. It cannot renew them: minting needs the user's token.
- **A Plugin token leaking on its own, from a log for example.** Read-only core access as that user until it expires.
- **A third-party site calling a Plugin Backend from the user's browser.** It has no token to send, and `usePluginApi` sends no cookie (`credentials: 'omit'`), so the call is anonymous. That is why `Access-Control-Allow-Origin: *` is safe on a Plugin Backend.
- **The user-token cookie.** The host mirrors the user's token into a `token` cookie for `COOKIE_DOMAIN`, which is how SSR reads it. A Plugin Backend under that domain would receive it with every script its remote loads. Plugin Backends must be hosted outside `COOKIE_DOMAIN`.
- **Plugin code.** Plugin frontends run in the host page. They can read the user's token, mint a token for any pluginId, and pass any `baseUrl`. `aud`, the admin opt-in and the deny list protect against Plugin Backends, not against plugin frontend code, which the host already trusts that far.

## Considered options

- **The core reverse-proxies `/plugins/{pluginId}/…` to a backend registered in its own config (PR #893).** Same-origin and one place for auth. But every byte crosses the core, each backend needs a shared secret and a registry entry, and the core must defend an outbound request path (SSRF, redirects, timeouts). Rejected once direct calls proved simpler to secure.
- **The identity provider issues Plugin tokens (RFC 8693 token exchange).** It exists only in OIDC mode, and Keycloak, Entra ID and others configure it differently. The core already computes the Subject. Rejected.
- **A second exchange, for a separate core token held by the Plugin Backend.** It protects only against a Plugin token leaking without the backend's credential, at the cost of an endpoint, a credential per plugin and a second token type. Dropped.
- **The frontend reads the core and sends the data to its backend.** Needs nothing new, but fits only small data the user is looking at.
- **A service account per plugin.** It reads what the account may read, not what the user may.
- **Forwarding the user's token.** Every Plugin Backend would hold a token valid on the whole core API, writes and admin rights included.

## Consequences

- Each Plugin Backend verifies tokens and sets CORS. `plugin-backend-example/` is the one reviewed implementation to copy.
- Rate limiting, logging and audit of plugin traffic move into each Plugin Backend. The core limits minting, per process, to 30 tokens a minute per Subject and plugin and 120 per Subject overall, since any well-formed pluginId is accepted.
- The core answers one mint per user and plugin about every 5 minutes, or sooner when the user's token expires first.
- A gateway that verifies tokens in front of the core must trust the plugin key set for the core's route, or Plugin Backends must reach the core behind it (`docs/authentication.md`).
- Not done here: refusing to mint for a plugin that is disabled or whose ACL the user fails (theme entries carry no pluginId yet), and access while the user is away, such as nightly jobs.
