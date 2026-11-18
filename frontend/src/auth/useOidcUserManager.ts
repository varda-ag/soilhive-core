import { useEffect, useMemo } from 'react';
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import type { AuthConfig, OIDCConfig } from './AuthConfig';
import { AuthModes } from './types';
import { getReturnTo } from './signinReturnTo';
import { getPageState, setRestoredPageState } from './signinPageState';

// Runs before the provider stops loading, so the router is created on this URL and the pages that put
// their state back find it when they mount.
function onSigninCallback(user: User | undefined): void {
  setRestoredPageState(getPageState(user?.state));
  window.history.replaceState({}, document.title, getReturnTo(user?.state) ?? window.location.pathname);
}

/**
 * The UserManager for OIDC mode, or none in the other auth modes. `key` goes on ReactOidcProvider:
 * it changes exactly when a new instance is built.
 */
export function useOidcUserManager(authConfig: AuthConfig | undefined) {
  // Built here, not by react-oidc-context, so a renew sees the error: only an IdP rejection ends the session.
  // Keyed on the config content: react-oidc-context reads its userManager prop once, so a changed config
  // needs both a new instance and a new provider (`key`). The same content keeps both.
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

  return { userManager, key: oidcConfigKey, onSigninCallback };
}
