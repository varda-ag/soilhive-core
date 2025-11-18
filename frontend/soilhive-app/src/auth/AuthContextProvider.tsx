import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthConfig } from "./AuthConfig";
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { type AuthContext } from "./AuthContext";
import { usePasswordAuth } from "./usePasswordAuth";
import { LoginModal } from "./LoginModal";
import { useRequest } from "../api-client";
import { AuthModes, type AuthModesType } from "./types";
import { clearToken, saveToken } from "./tokenStore";

const authContext = createContext<AuthContext | undefined>(undefined);

export function useAuthContext(): AuthContext {
    const ctx = useContext(authContext);
    if (!ctx)
        throw Error("Auth Context not defined");
    return ctx;
}

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
    const [authConfig, setAuthConfig] = useState<AuthConfig>();

    const { request } = useRequest();

    useEffect(() => {
        request({ url: 'http://localhost:4001/auth/config' })
            .then(setAuthConfig)
            .catch(console.error);
    }, []);

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
                onSigninCallback={() => {
                    const url = new URL(window.location.href);
                    window.history.replaceState({}, document.title, url.pathname);
                }}
            >
                <InnerProvider authMode={authConfig.authMode}>
                    {children}
                </InnerProvider>
            </ReactOidcProvider>
        );
    } else {
        return (
            <InnerProvider authMode={authConfig ? authConfig.authMode : AuthModes.NONE}>
                {children}
            </InnerProvider>
        );
    }
}

// this is to prevent conditionally rendering hooks
function InnerProvider({ children, authMode }: { children: React.ReactNode, authMode: AuthModesType }) {
    switch (authMode) {
        case AuthModes.OIDC:
            return <OidcAuthProvider>{children}</OidcAuthProvider>;
        case AuthModes.PASSWORD:
            return <PasswordAuthProvider>{children}</PasswordAuthProvider>;
        case AuthModes.NONE:
            return <NoAuthProvider>{children}</NoAuthProvider>;
        default:
            return <NoAuthProvider>{children}</NoAuthProvider>;
    }
}

function OidcAuthProvider({ children }: { children: React.ReactNode }) {
    const reactOidcAuth = useReactOidcAuth();
    
    useEffect(() => {
        saveToken(reactOidcAuth.user?.access_token);
    }, [reactOidcAuth.user?.access_token]);

    const value: AuthContext = {
        isAuthenticated: !!reactOidcAuth.isAuthenticated,
        isLoading: reactOidcAuth.isLoading,
        error: reactOidcAuth.error,
        token: reactOidcAuth.user,
        login: () => reactOidcAuth.signinRedirect(),
        logout: () => {
            clearToken();
            reactOidcAuth.signoutRedirect(); 
        },
        authMode: AuthModes.OIDC
    };

    return (
        <authContext.Provider value={value}>
            {children}
        </authContext.Provider>
    );
}

function PasswordAuthProvider({ children }: { children: React.ReactNode }) {
    const [showLoginModal, setShowLoginModal] = useState(false);
    const passwordAuth = usePasswordAuth();

    const value: AuthContext = {
        isAuthenticated: passwordAuth.isAuthenticated,
        isLoading: passwordAuth.isLoading,
        error: passwordAuth.error,
        token: passwordAuth.token,
        login: () => setShowLoginModal(true),
        logout: passwordAuth.logout,
        authMode: AuthModes.PASSWORD
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
        isAuthenticated: true,
        isLoading: false,
        error: undefined,
        token: {profile: {name: 'Anonymous User'}},
        login: () => {},
        logout: () => {},
        authMode: AuthModes.NONE
    };

    return (
        <authContext.Provider value={value}>
            {children}
        </authContext.Provider>
    );
}