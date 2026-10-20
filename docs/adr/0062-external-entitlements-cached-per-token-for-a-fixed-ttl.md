# External entitlements are cached per token for a fixed TTL

**Status:** Proposed — needs acceptance from the team that owns the external entitlements service (sh-api-services) for the staleness window below.

Every request on a route with `x-entitlements-required` calls `ENTITLEMENTS_ENDPOINT` with the caller's bearer token (`EntitlementService.callEntitlementsEndpoint`). In QA that call takes ~2.2 s, so a page load that fires 4 such requests costs ~8 s and every later PUT/POST/poll pays it again. We cache the endpoint's reply in memory, per process, keyed by a SHA-256 hash of `token.raw`, for a fixed TTL (30 min by default, `ENTITLEMENTS_CACHE_TTL_MS`), with one shared in-flight call per key so parallel requests with the same token make one external call.

**The trade-off:** a dataset grant removed in sh-api-services stays valid in core for up to the TTL, on every node that cached it. There is no invalidation signal from that service. With the QA realm's access-token lifespan of 1 day, the token does not change within the TTL, so the TTL — not token renewal — is the real staleness bound.

## Consequences

- Only the external reply is cached. Local grants (`entitlements` table, `EVERYONE`) and the slug-history expansion still run on every request, so a local grant or revoke takes effect at once.
- Only a valid 2xx reply with the agreed shape is cached. Errors, network failures and malformed replies are not, so an outage of the external service does not remove external grants for the full TTL; the next request retries.
- A cache hit returns a copy, so no caller can change the cached entry. If a caller wrote local grants into the cached object, they would be cached too and a local revoke would last the full TTL. As a second layer, `getUserEntitlements` merges into a new object and never writes into the external result it receives.
- No fetch timeout is added. The existing fallback (local grants only) still covers a failed call.
- The cache-bypass header (ADR-0028) also skips this cache, so a cold measurement includes the external call.
- `ENTITLEMENTS_CACHE_TTL_MS=0` (or any value <= 0) turns the cache off: every request calls the endpoint and nothing is stored. This is the switch for an incident, e.g. a grant revoked in sh-api-services that must stop working at once. An unset, empty or non-numeric value gives the 30-min default.
- The TTL is not capped at the token's `exp`: `tokenValidator` rejects an expired token (`jwt.verify`) before entitlements load, so an entry for an expired token is never read. The LRU entry limit bounds memory.
- No effect in production today: `ENTITLEMENTS_ENDPOINT` is not set there. If it is enabled later, the same window applies; check that realm's access-token lifespan too.

## Considered options

- **Key on `sub` (rejected).** The endpoint's only input is the token, and core does not know which claims sh-api-services reads (`client_id`/`azp`, scope, roles, groups). Two tokens with the same `sub` can then get different answers, and a `sub` key would serve one token's answer to the other. It is also a third notion of identity next to the Subject (ADR-0022). With 1-day tokens, the token key has almost the same hit rate. Revisit only if the entitlements team guarantees that the answer depends only on `sub`.
- **Key on the raw token string (rejected).** Same behaviour as the hash, but keeps bearer tokens in memory as map keys.
- **Shorter TTL, e.g. 5 min (rejected for now).** Smaller staleness window, but list polls and longer sessions would pay the external call again more often. The TTL is an env var, so this can change without a release.
- **Shared cache (Redis) or an invalidation signal from sh-api-services (rejected).** New infrastructure or a cross-team contract for an endpoint that is not enabled in production yet.
