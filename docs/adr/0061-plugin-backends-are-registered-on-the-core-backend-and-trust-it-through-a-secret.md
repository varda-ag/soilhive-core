# Plugin Backends are registered on the core backend's deployment, and trust it through a secret

The core backend forwards `/plugins/{pluginId}/{path}` to the Plugin's own backend (ADR 0060). It finds that backend in two environment variables of its own deployment, and nowhere else: `PLUGIN_BACKENDS` maps each `pluginId` to a base URL, and `PLUGIN_BACKEND_SECRETS` maps it to a secret. Nothing in a request can name the address or change it. A `pluginId` with no entry gets a `404`.

The core backend checks the caller's token itself. Then it forwards the call with `Authorization: Bearer <that plugin's secret>` in place of the caller's token and, for a signed-in caller, `X-SoilHive-Subject: <the caller's Subject>`. It never forwards the caller's token or cookies, and it drops any `X-SoilHive-*` header the caller sent.

## Why the URL never comes from the request

The first design had the Plugin export its backend's URL, from a build-time variable such as `DASHBOARD_PLUGIN_BACKEND_BASE_URL`, and pass it to `usePluginApi` as a second argument. The host would then send it with every call. The core backend cannot tell the host's requests from those of any other HTTP client, so anyone, signed in or not, could send any URL. The route would become a server-side request forgery (SSRF) endpoint that also returns what it fetched:

- The caller reaches what only the core backend can reach: the cloud metadata endpoint at `169.254.169.254` (the core backend runs under an IAM role for S3 and RDS), the database, and every service on the cluster network.
- The core backend becomes an open relay to the whole internet, sending from our IP addresses.
- Whatever the core backend adds to a forwarded call goes wherever the caller points it. The secret below would be collected on the first call and replayed against the real Plugin Backend under any user's name.

Refusing private addresses, plain `http` and redirects narrows the first point but not the other two, and it is easy to get wrong: DNS rebinding, other notations for the same IP address, redirects. The only check that holds is a list of allowed URLs for each `pluginId`, kept on the server. Once the server has that list, the URL in the request adds nothing. So the list is the whole mechanism.

## Why a secret, and the Subject

A Plugin Backend serves its Plugin's remote over the same port, and every visitor's browser downloads the remote from there. So anyone can call it directly, not only through the core backend. A header naming the user is worth something only if the Plugin Backend can tell that the core backend sent it. A secret that only the two of them hold proves it.

The header carries the Subject, the identity that Entitlements and every `created_by` are keyed by, rather than the token's `sub`. So a Plugin Backend records the same identity the core backend does.

## Considered options

- **The Plugin names its backend's URL, and the host sends it with every call**: rejected, see above.
- **The same, checked against an allowlist on the server**: rejected. It is safe, but every URL is configured twice, in the Plugin's build and in the core backend's deployment. The extra request header would also have to join the core backend's CORS allowlist. The URL from the request adds nothing to the check.
- **A `backendUrl` on the Plugin's entry in the theme config**: rejected. The theme config can be read anonymously, because the frontend reads it before anyone signs in, so it would publish internal addresses. Anyone who may write it could point the core backend at an internal address. And the entry has no `pluginId`: the id comes from the Plugin's code, which the core backend never loads.
- **The Plugin declares its backend in its manifest, and the core backend reads it from there**: not now. It ties the URL to the manifest the operator registered, but the core backend would trust whatever every manifest says, and whoever runs it could not review which addresses it calls.
- **Forward the user's token to the Plugin Backend**: rejected. Every Plugin Backend would hold a token it could replay against the core API as that user, and it would have to validate the token against the deployment's identity provider.
- **A short-lived token signed by the core backend for each call** (a JWT whose audience is the `pluginId`): not now. No long-lived secret would travel with every call, and a stolen token would expire. But every Plugin Backend would have to verify signatures, and the core backend would have to manage keys. Worth revisiting when a Plugin Backend holds sensitive data.

## Consequences

- Adding or moving a Plugin Backend is a change to the core backend's deployment: two environment variables and a restart, by whoever runs the core backend. A Plugin cannot add or move one by itself. The core backend refuses to start on a malformed entry, a missing secret or one under 32 characters.
- The Plugin's bundle carries no backend URL, so one build serves every environment, and `usePluginApi` keeps its single argument.
- A Plugin Backend must refuse every call that does not carry its secret, and trust `X-SoilHive-Subject` only on a call that does. It must turn a user away with a `403`, not a `401`. A `401` from it reaches the host as a `502`, because it can only mean that the secret is wrong (ADR 0060).
- The secret is static and travels with every call. Use `https` unless the Plugin Backend is on the cluster's private network. Rotating it means restarting both sides.
- Responses are served from the core backend's origin. So the core backend hands a Plugin Backend's redirect back to the caller instead of following it, drops `Set-Cookie` and CORS headers, and sends every response with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.
- A request body is capped at `MAX_UPLOAD_SIZE_MB`, as for uploads. `PLUGIN_BACKEND_TIMEOUT_MS` (default one minute) caps the wait for a Plugin Backend to start answering. Rate limiting is not part of the route yet.
