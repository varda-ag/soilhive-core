# Authentication

The frontend supports three authentication modes, selected at runtime based on the backend's `/auth/config` response. No build-time changes are needed to switch between them.

## Auth modes

| Mode | Description |
|---|---|
| `oidc` | OAuth 2.0 / OpenID Connect via Keycloak or any compliant provider |
| `password` | Simple username + password form, tokens issued by the backend |
| `none` | Public access — no authentication required |

The mode is fetched from the backend at startup by `AuthContextProvider`. The appropriate auth UI and token-handling logic are loaded based on the response.

---

## Provider setup

**File:** `src/auth/AuthContextProvider.tsx`

`AuthContextProvider` sits inside `QueryClientProvider` but wraps `ThemeProvider` and everything below it. It:

1. Fetches `/auth/config` from the backend.
2. Renders the correct auth provider depending on the mode:
   - `oidc` → wraps children in `react-oidc-context`'s `AuthProvider` configured with the OIDC settings returned by the backend.
   - `password` → uses `usePasswordAuth` to manage token state locally.
   - `none` → passes children through with a no-op auth context.

---

## AuthContext

**File:** `src/auth/AuthContext.tsx`

The common interface exposed to the rest of the app regardless of mode:

```ts
interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: () => void;
  logout: () => void;
  token: string | null;
}
```

Access it through the `useAuth` hook (or indirectly through `useEntitlementsHook` for permission checks).

---

## Token storage

**File:** `src/auth/tokenStore.ts`

Tokens are stored in `localStorage` (or `sessionStorage` when configured). The store exposes three functions:

```ts
setToken(token: string): void
getToken(): string | null
clearToken(): void
```

`httpClient` calls `getToken()` before every request to attach the `Authorization: Bearer` header. `handleError` in the API client calls `clearToken()` on any `401` response, which forces the user to re-authenticate.

During SSR, `getToken()` safely returns `null` because `localStorage` is not available on the server. The Express server passes the token explicitly via the `context.authToken` argument to the `render()` function instead.

---

## OIDC mode

When the backend returns `mode: 'oidc'`, the frontend receives an `OIDCConfig` object:

```ts
interface OIDCConfig {
  authority: string;       // e.g. https://auth.example.com/realms/soilhive
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
}
```

`react-oidc-context` handles the full OIDC flow including:
- Redirect to the provider's login page
- Callback URL handling and code exchange
- Silent token renewal (`automaticSilentRenew: true`)
- Token storage in `localStorage`

For Keycloak-specific setup see [docs/keycloak-setup.md](../keycloak-setup.md).

---

## Password mode

`usePasswordAuth` (`src/auth/usePasswordAuth.ts`) manages a `LoginModal` that collects credentials, posts them to the backend, and stores the returned JWT in `tokenStore`. Logout clears the token.

---

## Entitlements (permissions)

**File:** `src/hooks/useEntitlementsHook.ts`

After login, the JWT payload contains an `entitlements` claim. The `useEntitlementsHook` hook decodes the token and exposes:

```ts
const { isAdmin, entitlements } = useEntitlementsHook();
```

`AdminPortalGuard` uses `isAdmin` to gate the admin routes. Components can check individual entitlements for feature-level access control.

---

## Login modal

The `LoginModal` component (`src/auth/LoginModal.tsx`) is shown when:
- An unauthenticated user tries to access a protected route.
- The session expires and a request returns `401`.

It is rendered at the app root level so it can appear over any route without unmounting the current page.

---

## SSR and auth

For SSR routes the server reads the token from the `token` cookie, which `tokenStore` mirrors from `localStorage` (falling back to an `Authorization: Bearer` header), and passes it to the React render function so prefetched queries include authenticated data. An expired token is dropped and the page renders anonymously; the signature is not verified, the backend does that.

On hydration, `SsrAuthContextProvider` applies the same expiry check (`isTokenExpired`, 30s buffer) and clears an expired token from storage, so the page agrees with the anonymous render and never sends the stale token. It does not attempt a silent renew; the main app does that on the next visit.

See [ssr.md](ssr.md) for the full server-side rendering flow.
