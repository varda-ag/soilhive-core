import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthConfig } from './AuthConfig';
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { type AuthContext } from './AuthContext';
import { usePasswordAuth } from './usePasswordAuth';
import { LoginModal } from './LoginModal';
import { AuthModes, type AuthModesType } from './types';
import { clearToken, saveToken, getToken } from './tokenStore';
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
        onSigninCallback={() => {
          const url = new URL(window.location.href);
          window.history.replaceState({}, document.title, url.pathname);
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
  // explicitly: drop the token and remove the user so isAuthenticated flips to
  // false (login UI reappears). This is a quiet logout, not a forced re-login.
  const { events, removeUser } = reactOidcAuth;
  useEffect(() => {
    const handleExpired = () => {
      clearToken();
      removeUser();
    };
    events.addAccessTokenExpired(handleExpired);
    return () => events.removeAccessTokenExpired(handleExpired);
  }, [events, removeUser]);

  const value: AuthContext = {
    isAuthenticated: !!reactOidcAuth.isAuthenticated,
    isLoading: reactOidcAuth.isLoading,
    error: reactOidcAuth.error,
    user: reactOidcAuth.user,
    login: () => reactOidcAuth.signinRedirect(),
    logout: () => {
      clearToken();
      reactOidcAuth.signoutRedirect();
    },
    authMode: AuthModes.OIDC,
  };

  return <authContext.Provider value={value}>{reactOidcAuth.isLoading ? null : children}</authContext.Provider>;
}

function PasswordAuthProvider({ children }: { children: React.ReactNode }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const passwordAuth = usePasswordAuth();

  const value: AuthContext = {
    isAuthenticated: passwordAuth.isAuthenticated,
    isLoading: passwordAuth.isLoading,
    error: passwordAuth.error,
    user: passwordAuth.user,
    login: () => setShowLoginModal(true),
    logout: passwordAuth.logout,
    authMode: AuthModes.PASSWORD,
  };

  return (
    <authContext.Provider value={value}>
      {passwordAuth.isLoading ? null : children}
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
    isAuthenticated: true,
    isLoading: false,
    error: undefined,
    user: undefined,
    login: () => {},
    logout: () => {},
    authMode: AuthModes.NONE,
  };

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}

export function SsrAuthContextProvider({ children }: { children: React.ReactNode }) {
  const token = getToken();
  const value: AuthContext = {
    isAuthenticated: !!token,
    isLoading: false,
    error: undefined,
    user: token ? { access_token: token } : null,
    login: () => {},
    logout: () => {},
    authMode: AuthModes.NONE,
  };
  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}
