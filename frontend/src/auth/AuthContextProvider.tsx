import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { AuthConfig } from './AuthConfig';
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { type AuthContext } from './AuthContext';
import { usePasswordAuth } from './usePasswordAuth';
import { LoginModal } from './LoginModal';
import { AuthModes, type AuthModesType } from './types';
import { clearToken, saveToken, getToken } from './tokenStore';
import { refreshAccessToken, setTokenRefresher } from './tokenRefresher';
import { getEmailFromAccessToken, isTokenExpired } from './tokenClaims';
import { getCurrentPath, getReturnTo, hasCallbackParams, type SigninState } from './signinReturnTo';
import { WebStorageStateStore } from 'oidc-client-ts';
import { useApiQuery } from 'hooks/useApiQuery';

const authContext = createContext<AuthContext | undefined>(undefined);

export function useAuthContext(): AuthContext {
  const ctx = useContext(authContext);
  if (!ctx) throw new Error('Auth Context not defined');
  return ctx;
}

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { data: authConfig, isLoading: isAuthConfigLoading } = useApiQuery<AuthConfig>({
    endpoint: '/auth/config',
    method: 'GET',
    queryKey: ['/auth/config'],
    enabled: true,
    authenticate: false,
  });

  if (isAuthConfigLoading) return;

  if (authConfig && authConfig.authMode === AuthModes.OIDC && authConfig.oidcConfig) {
    return (
      <ReactOidcProvider
        authority={authConfig.oidcConfig.authority}
        client_id={authConfig.oidcConfig.clientId}
        redirect_uri={authConfig.oidcConfig.redirectUri}
        post_logout_redirect_uri={authConfig.oidcConfig.postLogoutRedirectUri}
        scope={authConfig.oidcConfig.scope}
        automaticSilentRenew
        silent_redirect_uri={authConfig.oidcConfig.silentRedirectUri}
        loadUserInfo
        revokeTokensOnSignout
        userStore={new WebStorageStateStore({ store: window.localStorage })}
        onSigninCallback={user => {
          // Runs before the provider stops loading, so the router is created on this URL.
          window.history.replaceState({}, document.title, getReturnTo(user?.state) ?? window.location.pathname);
        }}
      >
        <InnerProvider authMode={authConfig.authMode}>{children}</InnerProvider>
      </ReactOidcProvider>
    );
  } else {
    return <InnerProvider authMode={authConfig ? authConfig.authMode : AuthModes.NONE}>{children}</InnerProvider>;
  }
}

// this is to prevent conditionally rendering hooks
function InnerProvider({ children, authMode }: { children: React.ReactNode; authMode: AuthModesType }) {
  switch (authMode) {
    case AuthModes.OIDC:
      return <OidcAuthProvider>{children}</OidcAuthProvider>;
    case AuthModes.PASSWORD:
      return <PasswordAuthProvider>{children}</PasswordAuthProvider>;
    default:
      return <NoAuthProvider>{children}</NoAuthProvider>;
  }
}

function OidcAuthProvider({ children }: { children: React.ReactNode }) {
  const reactOidcAuth = useReactOidcAuth();

  // Persist a token only if valid. Avoid saving an expired access_token
  // (e.g. a stale user restored from storage at load which would then be sent on every request and 401)
  const validToken = reactOidcAuth.user && !reactOidcAuth.user.expired ? reactOidcAuth.user.access_token : undefined;

  useEffect(() => {
    if (validToken) {
      saveToken(validToken);
    } else {
      clearToken();
    }
  }, [validToken]);

  // react-oidc-context does not subscribe to accessTokenExpired, so on expiry
  // it never clears the user and the stale token keeps being used. Handle it
  // explicitly: first try a silent renew, since the scheduled one may only have
  // missed its window (throttled tab, machine sleep), and signing out would
  // replace any page that needs a signed-in user, losing its state. Only if
  // that fails, drop the token and remove the user so isAuthenticated flips to
  // false (login UI reappears). This is a quiet logout, not a forced re-login.
  const { events, removeUser } = reactOidcAuth;
  useEffect(() => {
    const handleExpired = async () => {
      // Shared with the httpClient, so a request that 401'd meanwhile joins this renew.
      if (await refreshAccessToken()) return;
      clearToken();
      removeUser();
    };
    events.addAccessTokenExpired(handleExpired);
    return () => events.removeAccessTokenExpired(handleExpired);
  }, [events, removeUser]);

  // Expose a one-shot silent renew to the standalone httpClient so it can
  // recover from a 401 caused by an expired token (e.g. the scheduled
  // automaticSilentRenew missed its window while the tab was throttled/asleep).
  const { signinSilent } = reactOidcAuth;
  useEffect(() => {
    setTokenRefresher(async () => {
      const renewed = await signinSilent();
      const token = renewed && !renewed.expired ? renewed.access_token : undefined;
      if (token) {
        saveToken(token);
      } else {
        clearToken();
      }
      return token;
    });
    return () => setTokenRefresher(undefined);
  }, [signinSilent]);

  // Entitlements are keyed by the Subject, which the backend resolves email-first from the access
  // token. If this IdP does not put `email` there, no Subject is ever an email address and every
  // grant a data admin types is unreachable — silently, since the grant still stores fine. Probe
  // the current token to find out, and let the Admin Portal say so. Token validity is irrelevant
  // here: an expired token still reports this IdP's claim mapping accurately.
  const accessToken = reactOidcAuth.user?.access_token;
  const isEmailBasedAuth = useMemo(() => !!getEmailFromAccessToken(accessToken), [accessToken]);

  // react-oidc-context also sets isLoading during every sign-in/out call (activeNavigator is set
  // then), including the silent renew above. Only the initial session restore leaves sign-in state
  // unknown; hiding the app for the others would remount it and lose page state.
  const isRestoringSession = reactOidcAuth.isLoading && !reactOidcAuth.activeNavigator;

  const value: AuthContext = {
    isAuthenticated: !!reactOidcAuth.isAuthenticated,
    isLoading: isRestoringSession,
    error: reactOidcAuth.error,
    user: reactOidcAuth.user,
    login: () => reactOidcAuth.signinRedirect({ state: { returnTo: getCurrentPath() } satisfies SigninState }),
    logout: () => {
      clearToken();
      reactOidcAuth.signoutRedirect();
    },
    authMode: AuthModes.OIDC,
    isEmailBasedAuth,
  };

  return (
    <authContext.Provider value={value}>
      {isRestoringSession ? null : <WithoutCallbackParams>{children}</WithoutCallbackParams>}
    </authContext.Provider>
  );
}

// Holds the app back until the URL carries no sign-in callback params. onSigninCallback replaces the
// URL on success, but a failed callback leaves them there, and every reload would replay it, fail
// again and leave the stored session unread. Cleared before the app mounts, so the router is created
// on the clean URL.
function WithoutCallbackParams({ children }: { children: React.ReactNode }) {
  const [isUrlClean, setIsUrlClean] = useState(() => !hasCallbackParams());

  useLayoutEffect(() => {
    if (isUrlClean) return;
    window.history.replaceState({}, document.title, getCurrentPath());
    setIsUrlClean(true);
  }, [isUrlClean]);

  return isUrlClean ? <>{children}</> : null;
}

function PasswordAuthProvider({ children }: { children: React.ReactNode }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const passwordAuth = usePasswordAuth();

  const value: AuthContext = {
    isAuthenticated: passwordAuth.isAuthenticated,
    // The session is read synchronously from storage, so sign-in state is always known. A login
    // in progress shows in the modal; reporting it here would blank the page behind it.
    isLoading: false,
    error: passwordAuth.error,
    user: passwordAuth.user,
    login: () => setShowLoginModal(true),
    logout: passwordAuth.logout,
    authMode: AuthModes.PASSWORD,
    // Password-mode tokens do carry an `email` claim, but a synthetic one per role
    // (`data-admin@localhost`, `super-admin@localhost` — see backend `AuthService.getTokenPayload`).
    // Those are the only Subjects reachable, so granting a real person's address is still futile.
    isEmailBasedAuth: false,
  };

  return (
    <authContext.Provider value={value}>
      {children}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={passwordAuth.login}
        error={passwordAuth.error}
      />
    </authContext.Provider>
  );
}

function NoAuthProvider({ children }: { children: React.ReactNode }) {
  const value: AuthContext = {
    // Nobody can sign in on a deployment without an identity system.
    isAuthenticated: false,
    isLoading: false,
    error: undefined,
    user: undefined,
    login: () => {},
    logout: () => {},
    authMode: AuthModes.NONE,
    isEmailBasedAuth: false,
  };

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}

export function SsrAuthContextProvider({ children }: { children: React.ReactNode }) {
  // The server renders anonymously with an expired token, so the hydrated page must too, and clear it
  // as the main app would. In render, not an effect: child effects, where queries start, run first.
  const [token] = useState(() => {
    const stored = getToken();
    if (!stored || !isTokenExpired(stored)) return stored;
    // Client only: the server never stored it, and clearToken touches localStorage.
    if (typeof window !== 'undefined') clearToken();
    return null;
  });
  const value: AuthContext = {
    isAuthenticated: !!token,
    isLoading: false,
    error: undefined,
    user: token ? { access_token: token } : null,
    login: () => {},
    logout: () => {},
    authMode: AuthModes.NONE,
    isEmailBasedAuth: false,
  };
  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}
