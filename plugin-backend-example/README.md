# Plugin Backend example

A minimal **Plugin Backend**: the HTTP API a plugin's own deployment serves next to its remote. Copy it as a starting point. It does the parts every Plugin Backend must get right:

- it checks the **Plugin token** the host sends with a signed-in user's calls;
- it sets CORS headers on every response, and answers a preflight before any token check;
- it reads the SoilHive core as the user, with that same token;
- it never logs a token or a cookie.

Why it works this way: [ADR 0063](../docs/adr/0063-plugins-call-their-backend-directly-with-a-plugin-token.md). The plugin's side: [Calling your plugin's own backend](../docs/frontend/plugin-development.md#calling-your-plugins-own-backend).

## Run it

```bash
pnpm install
cp .env-example .env   # then edit it
node --env-file=.env --import tsx src/server.ts
```

| Variable                     | Meaning                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLUGIN_ID`                  | The id your plugin exports as `pluginId`. A token is accepted only if its `aud` is `plugin:{PLUGIN_ID}`.                                                                                   |
| `SOILHIVE_CORE_URL`          | The core's `CORE_PUBLIC_URL`, exactly (e.g. `https://api.soilhive.example/api/v1`). Every token's `iss` must equal it.                                                                     |
| `SOILHIVE_CORE_INTERNAL_URL` | Optional. Where this backend reaches the core, for its keys and its reads, when not at `SOILHIVE_CORE_URL`: an in-cluster address, or one that skips a gateway that refuses Plugin tokens. |
| `PORT`                       | Default `8080`.                                                                                                                                                                            |
| `STATIC_DIR`                 | Optional. Your plugin's built remote (its `dist`), served on the same port, so the host's default address for your calls (the folder of `mf-manifest.json`) is this server.                |

## The token

The host gets a Plugin token from the core for your `pluginId` and the signed-in user, and sends it as `Authorization: Bearer …`. An anonymous visitor's calls carry none. The check, in [`src/pluginToken.ts`](src/pluginToken.ts):

- ES256 only, header `typ: plugin+jwt`;
- the key from `{core}/.well-known/plugin-jwks.json`, cached, and fetched again when a token names a key it does not hold;
- `iss` equal to `SOILHIVE_CORE_URL`, `aud` equal to `plugin:{PLUGIN_ID}`;
- `exp` and `sub` required, with up to 60 seconds of clock skew.

`sub` is the user's **Subject**, what the core grants Entitlements to. `scope` appears only when the core's deployment lists your plugin in `PLUGIN_TOKEN_ADMIN_PLUGINS`, and then holds `super-admin` and/or `data-admin` only.

Answer **401** to a missing or invalid token where one is needed, and to an invalid one anywhere: the host then gets a new token and retries once. Answer **403** to a user you turn away: a 401 there would only make the host renew the token for nothing.

## Reading the core as the user

Send the token you received back to the core (`GET /api/datasets` here). The core reads with it as the user, through their Entitlements, and refuses anything but a GET. External entitlements (`ENTITLEMENTS_ENDPOINT`) do not apply to a Plugin token: it sees the user's local grants only.

## CORS

The host page calls you from another origin. [`src/cors.ts`](src/cors.ts) is mounted first so every response carries `Access-Control-Allow-Origin: *`, a 401, a 404 and an error included. Without it the browser hides the status, and the host sees a failed call instead of the 401 that renews the token.

- A preflight (`OPTIONS`) gets a 204 before any token check: it never carries one.
- `Access-Control-Allow-Headers` echoes what the browser asks for, because `*` does not cover `Authorization`.
- No `Access-Control-Allow-Credentials`: cookies are never used.

A reverse proxy in front of this server must add the same headers to its own error pages (nginx: `add_header … always`).

## Deployment rules

- Serve it over HTTPS. The host refuses an `http` address except on `localhost`.
- Do not host it under the host's `COOKIE_DOMAIN`. The host keeps the user's own token in a cookie for that domain, and the browser would send it with every script your remote loads from here.
- Never log `Authorization` or `Cookie`.
- Never redirect an API call. The host refuses redirects, so a `301` or `302` (nginx adding a trailing slash to a directory, say) reaches the plugin as status `0`, the same as no response.
- A backend that serves several plugins checks `aud` per plugin, never "any plugin".
