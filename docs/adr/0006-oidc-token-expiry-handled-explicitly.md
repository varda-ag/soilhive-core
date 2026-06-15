# ADR 0006: Handle OIDC access-token expiry explicitly in `OidcAuthProvider`

**Status:** Accepted

## Context

API requests read their bearer token from `localStorage['token']` (via `tokenStore.getToken()` →
`httpClient`). For the OIDC auth mode, the only thing that keeps that `localStorage` entry in sync
with the real auth state is an effect in `OidcAuthProvider` ([AuthContextProvider.tsx](../../frontend/src/auth/AuthContextProvider.tsx)).

The original effect keyed on token **presence**:

```js
useEffect(() => {
  if (reactOidcAuth.user?.access_token) saveToken(reactOidcAuth.user.access_token);
  else clearToken();
}, [reactOidcAuth.user?.access_token]);
```

This silently breaks on access-token expiry. `react-oidc-context` (v3) subscribes only to
`addUserLoaded`, `addUserUnloaded`, `addUserSignedOut`, and `addSilentRenewError` — it does **not**
subscribe to `addAccessTokenExpired`. So when a token expires (and `automaticSilentRenew` did not
refresh it), the library never dispatches: `user.access_token` remains a truthy but stale string,
the effect's dependency never changes, the `else { clearToken() }` branch never runs, and the
expired token keeps being sent on every request → 401. `isAuthenticated` is also computed only at
dispatch time (`user ? !user.expired : false`), so it stays stale-true and no login prompt appears.
The app gets stuck silently 401-ing.

## Decision

Own token-expiry handling explicitly in `OidcAuthProvider`, in two parts:

1. **Gate the save-effect on validity, not presence** — write to `localStorage` only when
   `reactOidcAuth.user && !reactOidcAuth.user.expired`. An expired token is never persisted, which
   also closes the load-time hole (see Consequences).

2. **Subscribe to `reactOidcAuth.events.addAccessTokenExpired`** (the event `react-oidc-context`
   ignores) and on fire call `clearToken()` + `reactOidcAuth.removeUser()`, with a matching
   `removeAccessTokenExpired` cleanup. `removeUser()` dispatches `USER_UNLOADED`, flipping
   `isAuthenticated` to false so the login button reappears, and evicts the stale user from the
   OIDC `WebStorageStateStore` so a reload won't resurrect it.

This is a **quiet logout**: on expiry the user is returned to a logged-out UI, not force-redirected
to the IdP.

## Considered alternatives

- **Force re-login on expiry** (`removeUser()` → `signinRedirect()`). Rejected: more disruptive
  (full redirect, loses in-page state) than warranted for the recovery we need now.
- **Make the request layer validity-aware** (check expiry in `getToken`/`httpClient`). Rejected:
  spreads auth-lifecycle logic into the transport layer; the OIDC provider is the single source of
  truth for "what token is valid right now."
- **Rely on the existing 401 handler** ([error.ts](../../frontend/src/api-client/error.ts)) alone.
  Insufficient: it clears `localStorage` but never updates OIDC state, so the UI stays stale-true
  and concurrent in-flight requests still go out with the expired token.

## Consequences

- An already-expired token at app load is handled: `oidc-client-ts` always arms the expired-timer
  (clamped to a 1s minimum) when a user is loaded, so `accessTokenExpired` fires ~1s after init.
  The validity gate (part 1) prevents the stale token from being sent during that 1s window — the
  event handler then updates the UI.
- **Why silent renew fails is explicitly out of scope.** This ADR makes expiry *recover correctly*
  regardless of cause. If `automaticSilentRenew` is structurally broken (e.g. third-party-cookie /
  iframe restrictions on `silentRedirectUri`), users will be logged out once per short token
  lifetime — correct, but annoying. That is a separate follow-up (watch for `silentRenewError`,
  verify `silentRedirectUri` is reachable).
- A future "simplification" that drops the `addAccessTokenExpired` subscription, or reverts the
  effect to keying on `access_token` presence, will silently reintroduce the 401 loop. This ADR
  exists primarily to prevent that.
