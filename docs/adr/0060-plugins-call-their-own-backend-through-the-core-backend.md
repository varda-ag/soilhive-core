# A Plugin calls its own backend through the core backend, never directly

A Plugin's deployment may serve an API next to its remote, over the same port. Its frontend could call that API at the Plugin's own origin, or call the core backend and let it forward the call. We chose the second. `PluginContext.usePluginApi(pluginId)` sends every call to `{BACKEND_BASE_URL}/plugins/{pluginId}/{path}` through `httpClient`, the client behind every host call. The call goes to the same origin as every other host API call, which already accepts the host's origin, so a Plugin Backend needs no CORS allowlist of host origins and no knowledge of the host's identity provider. The host attaches the Signed-in user's token, and on a `401` it renews the token and retries where it can, as it does for its own calls. Authentication, and anything else every call needs, such as rate limiting, can then live in one place, the core backend, instead of in every Plugin Backend.

The Plugin passes its own `pluginId`, as it does to `usePluginConfig` and `useNotifications`, so one Plugin Context still serves every Plugin. The id is encoded into one path segment, and a path that resolves outside `/plugins/{pluginId}/` (`'/../other-plugin/x'`) rejects before anything is sent. This only guards against accidents: a Plugin runs in the host's page and can reach anything the host can. The core backend runs the same check again, since anyone can call it.

## Considered options

- **The browser calls the Plugin Backend directly**: rejected. Every Plugin Backend would need a CORS allowlist of every host origin, would receive the user's token itself, and would have to validate it against the host's identity provider.
- **Query and mutation hooks over the Plugin Backend, like the rest of the Plugin Context**: not now. The host cannot know a Plugin Backend's cache keys, or what a write invalidates. The client is the transport, and a Plugin wraps it in its own data fetching.

## Consequences

- How the core backend finds each Plugin Backend, and what it tells it about the caller, is ADR 0061.
- A `401` on this route means the core backend rejected the user's token. The host tries to renew the token and retry once, and if the call still ends in a `401` it drops the token, as for any core call. So the core backend never passes a Plugin Backend's own `401` through: it answers `502` instead.
- The client never shows a toast. A failed call rejects with a `PluginApiError`, which carries the HTTP status (`0` when there was no response) and the JSON error body, and the Plugin decides what to show. An aborted call rejects with its `AbortError` unchanged.
- The route is not in the OpenAPI spec, whose paths cannot end in a path of any depth. The core backend mounts it ahead of its body parsers, so a request body, multipart included, streams through untouched.
