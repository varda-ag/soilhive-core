import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthConfig } from "./AuthConfig";
import { fetchAuthConfig } from "./authApi";
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { type AuthContext } from "./AuthContext";
import { usePasswordAuth } from "./usePasswordAuth";
import { LoginModal } from "./LoginModal";

const authContext = createContext<AuthContext | undefined>(undefined)

export function useAuthContext(): AuthContext {
    const ctx = useContext(authContext)
    if (!ctx)
        throw Error("Auth Context not defined")
    return ctx
}

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
    const [authConfig, setAuthConfig] = useState<AuthConfig>()

    useEffect(() => {
        fetchAuthConfig()
            .then(setAuthConfig)
            .catch(console.error)
    }, [])

    if (authConfig && authConfig.oidcConfigured && authConfig.oidcConfig) {
        return (
            <ReactOidcProvider
                authority={authConfig.oidcConfig?.authority}
                client_id={authConfig.oidcConfig?.clientId}
                redirect_uri={authConfig.oidcConfig?.redirectUri}
                post_logout_redirect_uri={authConfig.oidcConfig?.postLogoutRedirectUri}
                scope={authConfig.oidcConfig?.scope}
                automaticSilentRenew
                silent_redirect_uri={authConfig.oidcConfig?.silentRedirectUri}
                loadUserInfo
                revokeTokensOnSignout
                onSigninCallback={() => {
                    const url = new URL(window.location.href);
                    window.history.replaceState({}, document.title, url.pathname);
                }}
            >
                <InnerProvider oidcEnabled={true}>
                    {children}
                </InnerProvider>
            </ReactOidcProvider>
        );
    }
    else {
        return <InnerProvider oidcEnabled={false}>{children}</InnerProvider>
    }
}

// an inner provider is needed to grab the auth configuration from the respective hooks
function InnerProvider({ children, oidcEnabled }: { children: React.ReactNode, oidcEnabled: boolean }) {

    const [shoLoginModal, setShowLoginModal] = useState(false)

    let value: AuthContext;

    if (oidcEnabled) {

        const reactOidcAuth = useReactOidcAuth()

        value = {
            isAuthenticated: !!reactOidcAuth.isAuthenticated,
            isLoading: reactOidcAuth.isLoading,
            error: reactOidcAuth.error,
            token: reactOidcAuth.user,
            login: () => reactOidcAuth.signinRedirect(),
            logout: () => reactOidcAuth.signoutRedirect(),
            authMode: 'oidc'
        }

        return (
            <authContext.Provider value={value}>
                {children}
            </authContext.Provider>
        )
    }
    else {

        const passwordAuth = usePasswordAuth()

        value = {
            isAuthenticated: passwordAuth.isAuthenticated,
            isLoading: passwordAuth.isLoading,
            error: passwordAuth.error,
            token: passwordAuth.token,
            login: () => setShowLoginModal(true),
            logout: passwordAuth.logout,
            authMode: 'password'
        }

        return (
            <authContext.Provider value={value}>
                {children}
                <LoginModal
                    isOpen={shoLoginModal}
                    onClose={() => setShowLoginModal(false)}
                    onLogin={passwordAuth.login}
                    error={passwordAuth.error}
                />

            </authContext.Provider>
        )
    }


}