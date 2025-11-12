export interface AuthConfig {
    oidcConfigured: boolean,
    oidcConfig?: {
        authority: string,
        clientId: string,
        redirectUri: string,
        postLogoutRedirectUri: string,
        silentRedirectUri: string,
        scope: string
    }
}