import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { AuthConfig, OIDCConfig } from './AuthConfig';
import { AuthProvider as ReactOidcProvider } from 'react-oidc-context';
import { type AuthContext } from './AuthContext';
import { usePasswordAuth } from './usePasswordAuth';
import { LoginModal } from './LoginModal';
import { AuthModes, type AuthModesType } from './types';
import { clearToken, getToken } from './tokenStore';
import { isTokenExpired } from './tokenClaims';
import { getCurrentPath, getReturnTo, hasCallbackParams } from './signinReturnTo';
import { getPageState, setRestoredPageState } from './signinPageState';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useApiQuery } from 'hooks/useApiQuery';
import { useOidcAuth } from './useOidcAuth';

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

  // Built here, not by react-oidc-context, so a renew sees the error: only an IdP rejection ends the session.
  // Keyed on the config content: react-oidc-context reads its userManager prop once, so a changed config
  // needs both a new instance and a new provider (the `key` below). The same content keeps both.
  const oidcConfig = authConfig?.authMode === AuthModes.OIDC ? authConfig.oidcConfig : undefined;
  const oidcConfigKey = oidcConfig && JSON.stringify(oidcConfig);
  const userManager = useMemo(() => {
    if (!oidcConfigKey) return undefined;
    // Read back from the key, so the instance depends on the content only.
    const config = JSON.parse(oidcConfigKey) as OIDCConfig;
    return new UserManager({
      authority: config.authority,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      post_logout_redirect_uri: config.postLogoutRedirectUri,
      scope: config.scope,
      // Started by the effect below, so only the kept instance renews.
      automaticSilentRenew: false,
      silent_redirect_uri: config.silentRedirectUri,
      loadUserInfo: true,
      revokeTokensOnSignout: true,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    });
  }, [oidcConfigKey]);

  // StrictMode builds the memo twice, and a changed config builds a new instance: only the one in use may
  // run the renew timer.
  useEffect(() => {
    userManager?.startSilentRenew();
    return () => userManager?.stopSilentRenew();
  }, [userManager]);

  if (isAuthConfigLoading) return;

  if (userManager) {
    return (
      <ReactOidcProvider
        key={oidcConfigKey}
        userManager={userManager}
        onSigninCallback={user => {
          // Runs before the provider stops loading, so the router is created on this URL and the pages
          // that put their state back find it when they mount.
          setRestoredPageState(getPageState(user?.state));
          window.history.replaceState({}, document.title, getReturnTo(user?.state) ?? window.location.pathname);
        }}
      >
        <OidcAuthProvider userManager={userManager}>{children}</OidcAuthProvider>
      </ReactOidcProvider>
    );
  } else {
    return <InnerProvider authMode={authConfig ? authConfig.authMode : AuthModes.NONE}>{children}</InnerProvider>;
  }
}

// this is to prevent conditionally rendering hooks
function InnerProvider({ children, authMode }: { children: React.ReactNode; authMode: AuthModesType }) {
  switch (authMode) {
    case AuthModes.PASSWORD:
      return <PasswordAuthProvider>{children}</PasswordAuthProvider>;
    default:
      return <NoAuthProvider>{children}</NoAuthProvider>;
  }
}

// oidc-client-ts stores the user under `oidc.user:<authority>:<client_id>` and removes it on sign-out.
// The `token` key is not a sign-out signal: a throttled tab clears it when its own copy expires.
function OidcAuthProvider({ children, userManager }: { children: React.ReactNode; userManager: UserManager }) {
  const value = useOidcAuth(userManager);

  return (
    <authContext.Provider value={value}>
      {value.isLoading ? null : <WithoutCallbackParams>{children}</WithoutCallbackParams>}
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
