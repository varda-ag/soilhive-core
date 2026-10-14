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

The header carries the Subject, the identity that Entitlements and every `created_by` are keyed by, rather than the token's `sub`. So a Plugin Backend records the same identity the core backend does. It is percent-encoded as UTF-8: a header value cannot carry characters beyond Latin-1, which an email address may hold, and sending one as it is would fail the call. A plain ASCII address is unchanged by the encoding.

## What else the core backend does to a forwarded call, and why

The registry and the secret decide where a call may go and who it says it comes from. Each of the rules below closes another way to misuse the route. `backend/tests/routes/plugins.test.ts` tests each one, except the start-up checks, which `backend/tests/services/ConfigService.test.ts` covers.

| The core backend | Because |
|---|---|
| Checks the caller's token, then sends the plugin's secret in its place, and drops cookies | A Plugin Backend never holds a credential it could replay against the core API as the user. A bad token gets the core backend's own `401`, which the host knows how to renew |
| Drops every `X-SoilHive-*` header the caller sent | Only the core backend may say who the caller is. Otherwise anyone could send `X-SoilHive-Subject: admin@…` through the route, and the Plugin Backend would believe it, since the call carries the secret |
| Refuses a path that resolves outside the base URL, or that holds an encoded slash (`%2F`) or a backslash, with a `400` | The base URL is the part of the Plugin Backend the deployment exposed. `/../admin` would reach the rest of that host. `%2F..%2F` would reach it too, on a server that decodes the path before routing it |
| Forwards only `GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `DELETE`, and answers `405` to the rest | No plugin call needs another method, and some are harmful: `TRACE` echoes the request back, headers included, and `CONNECT` asks for a tunnel |
| Hands a redirect back to the caller instead of following it | Following it would send the core backend wherever the Plugin Backend points, `169.254.169.254` included. That is the SSRF from above again, through a Plugin Backend that is compromised or careless. The browser can follow a redirect safely, since it reaches nothing the user can't |
| Rewrites a `Location` within the base URL so that it leads back through the route, answers `502` to a redirect to the Plugin Backend's own origin outside it, and leaves any other origin alone | The browser cannot reach the Plugin Backend's own address: a relative `Location` would resolve against the core backend's origin, and an absolute one would name an internal host, revealing it for nothing. A redirect elsewhere, a presigned download say, works as it is |
| Turns a Plugin Backend's `401` into a `502` | The host drops the user's token after a `401` it cannot renew (ADR 0060). From a Plugin Backend, a `401` can only mean the deployment's secret is wrong, so it must not cost the user their session |
| Drops `Set-Cookie` from the response | The response comes from the core backend's origin. A cookie set by a Plugin Backend would belong to the core backend, and the browser would send it with every later request there. The core backend never forwards cookies, so a Plugin Backend has no use for them anyway |
| Drops `Access-Control-*` headers from the response | Which web pages may read a core backend response is the core backend's CORS policy to decide. A Plugin Backend's `Access-Control-Allow-Origin: *` would widen it, or clash with the headers the core backend sets |
| Sends every response with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` | Opened in a tab at the core backend's URL, a Plugin Backend's HTML or SVG would otherwise run its scripts on the core backend's origin. `sandbox` gives the page an opaque origin and no scripts. `nosniff` stops a browser from treating a mislabelled response as a page |
| Caps the body at `MAX_UPLOAD_SIZE_MB` with a `413`, and counts a chunked body as it streams | The body streams through and is never held in memory, but without a cap anyone could push unlimited data through the core backend. The cap is the one uploads already use |
| Waits at most `PLUGIN_BACKEND_TIMEOUT_MS` (one minute by default) for the Plugin Backend to start answering once it has the whole request, then answers `504` | A Plugin Backend that hangs would otherwise hold a core backend connection open until the caller gives up. The clock starts once the request is sent and stops once the answer starts, so slow uploads and long downloads still work |
| Allows any request header in the CORS preflight on this route, for the origins the core backend already accepts | A plugin may send its own headers to its Plugin Backend. Every other route keeps the core backend's short list. The proxy still drops the headers that are not the plugin's to set |
| Refuses to start if either variable is malformed, or if a secret is missing or under 32 characters | A mistake shows up at deploy time, when the new pods fail their readiness check and the old ones keep serving, not on a user's first call. Below 32 characters, a secret is within reach of guessing |

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
- A Plugin Backend cannot set cookies or CORS headers through the route, and a page it serves cannot run scripts there. None of this affects a Plugin reading a response with `usePluginApi`, a file included (`responseType: 'blob'`).
- The route has no rate limiting yet, so one caller can send as many calls as the core backend accepts.
