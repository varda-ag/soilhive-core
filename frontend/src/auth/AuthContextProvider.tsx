import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { AuthConfig } from './AuthConfig';
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { type AuthContext } from './AuthContext';
import { usePasswordAuth } from './usePasswordAuth';
import { LoginModal } from './LoginModal';
import { AuthModes, type AuthModesType } from './types';
import { clearToken, saveToken, getToken } from './tokenStore';
import { refreshAccessToken, setSessionEnder, setTokenRefresher } from './tokenRefresher';
import { getEmailFromAccessToken, isTokenExpired } from './tokenClaims';
import { getCurrentPath, getReturnTo, hasCallbackParams, type SigninState } from './signinReturnTo';
import { getPageState, setRestoredPageState } from './signinPageState';
import { ErrorResponse, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSignOutInOtherTab } from './useSignOutInOtherTab';

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
  const oidcConfig = authConfig?.authMode === AuthModes.OIDC ? authConfig.oidcConfig : undefined;
  const userManager = useMemo(
    () =>
      oidcConfig &&
      new UserManager({
        authority: oidcConfig.authority,
        client_id: oidcConfig.clientId,
        redirect_uri: oidcConfig.redirectUri,
        post_logout_redirect_uri: oidcConfig.postLogoutRedirectUri,
        scope: oidcConfig.scope,
        // Started by the effect below, so only the kept instance renews.
        automaticSilentRenew: false,
        silent_redirect_uri: oidcConfig.silentRedirectUri,
        loadUserInfo: true,
        revokeTokensOnSignout: true,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
      }),
    [oidcConfig],
  );

  // StrictMode builds the memo twice, and a new config builds a new instance: only the one in use may
  // run the renew timer.
  useEffect(() => {
    userManager?.startSilentRenew();
    return () => userManager?.stopSilentRenew();
  }, [userManager]);

  if (isAuthConfigLoading) return;

  if (userManager) {
    return (
      <ReactOidcProvider
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
const isOidcUserKey = (key: string) => key.startsWith('oidc.user:');

const LOGIN_SERVER_RETRY_MS = 30_000;

function OidcAuthProvider({ children, userManager }: { children: React.ReactNode; userManager: UserManager }) {
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

  // Ends the session in this tab. The `oidc.user:` key is shared, so the other tabs sign out too.
  const { events, removeUser } = reactOidcAuth;
  const signOutHere = useCallback(() => {
    clearToken();
    return removeUser();
  }, [removeUser]);

  // The renew at expiry could not reach the login server (e.g. right after the machine wakes). The token
  // is gone, so the user shows as signed out until a retry below renews it or the IdP rejects it.
  const [isWaitingForLoginServer, setIsWaitingForLoginServer] = useState(false);

  // react-oidc-context does not subscribe to accessTokenExpired, so on expiry it never clears the
  // stale user. Try a silent renew first: the scheduled one may only have missed its window (throttled
  // tab, machine sleep). Sign out quietly only if the IdP rejects it.
  useEffect(() => {
    const handleExpired = async () => {
      // Shared with the httpClient, so a request that 401'd meanwhile joins this renew.
      const renew = await refreshAccessToken();
      if (renew.outcome === 'rejected') await signOutHere();
      setIsWaitingForLoginServer(renew.outcome === 'unavailable');
    };
    events.addAccessTokenExpired(handleExpired);
    return () => events.removeAccessTokenExpired(handleExpired);
  }, [events, signOutHere]);

  // Nothing else renews an expired token, so retry when the network or the tab comes back, and on a timer.
  useEffect(() => {
    if (!isWaitingForLoginServer) return;
    const retry = async () => {
      const renew = await refreshAccessToken();
      if (renew.outcome === 'rejected') await signOutHere();
      if (renew.outcome !== 'unavailable') setIsWaitingForLoginServer(false);
    };
    const retryIfVisible = () => {
      if (document.visibilityState === 'visible') void retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retryIfVisible);
    const timer = setInterval(retry, LOGIN_SERVER_RETRY_MS);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retryIfVisible);
      clearInterval(timer);
    };
  }, [isWaitingForLoginServer, signOutHere]);

  // Another tab signed out. No silent renew: the IdP session may still be alive for a moment.
  useSignOutInOtherTab(isOidcUserKey, signOutHere);

  // A 401 whose renew the IdP rejected ends the session, so the login UI shows.
  useEffect(() => {
    setSessionEnder(() => void signOutHere());
    return () => setSessionEnder(undefined);
  }, [signOutHere]);

  // Expose a one-shot silent renew to the standalone httpClient and to pluginTokens. It only renews:
  // a proactive renew can fail while the token is still valid. Called on the UserManager, not through
  // react-oidc-context, which hides the error.
  useEffect(() => {
    setTokenRefresher(async () => {
      const before = await userManager.getUser();
      try {
        const renewed = await userManager.signinSilent();
        if (renewed && !renewed.expired) {
          saveToken(renewed.access_token);
          return { outcome: 'renewed', token: renewed.access_token };
        }
      } catch (error) {
        // A timeout or a network error says nothing about the session: keep the token. A setup error
        // (e.g. no silent_redirect_uri and no refresh token) lands here too, so log it.
        if (!(error instanceof ErrorResponse)) {
          console.warn('Silent renew could not reach the login server:', error);
          return { outcome: 'unavailable' };
        }
      }
      // With refresh-token rotation, another tab renewing at the same time makes this renew fail. Its
      // new user is already stored: load it here instead of ending the session in every tab.
      const stored = await userManager.getUser();
      if (stored && !stored.expired && stored.access_token !== before?.access_token) {
        await userManager.events.load(stored);
        saveToken(stored.access_token);
        return { outcome: 'renewed', token: stored.access_token };
      }
      clearToken();
      return { outcome: 'rejected' };
    });
    return () => setTokenRefresher(undefined);
  }, [userManager]);

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

  // react-oidc-context sets isAuthenticated when the user loads and never on expiry.
  const isAuthenticated = !!reactOidcAuth.isAuthenticated && !isWaitingForLoginServer;

  const value: AuthContext = {
    isAuthenticated,
    isLoading: isRestoringSession,
    error: reactOidcAuth.error,
    // react-oidc-context keeps an expired user restored from storage. Expose it only while
    // authenticated, like the other providers, or callers gating on `user` send token-less
    // requests to auth-only routes (e.g. GET /entitlements → 401 toast).
    user: isAuthenticated ? reactOidcAuth.user : null,
    login: pageState =>
      reactOidcAuth.signinRedirect({ state: { returnTo: getCurrentPath(), ...(pageState && { pageState }) } satisfies SigninState }),
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
