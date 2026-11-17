import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth as useReactOidcAuth } from 'react-oidc-context';
import { ErrorResponse, type UserManager } from 'oidc-client-ts';
import { useTranslation } from 'react-i18next';
import useNotifications from 'hooks/useNotifications';
import { type AuthContext } from './AuthContext';
import { AuthModes } from './types';
import { clearToken, saveToken } from './tokenStore';
import { refreshAccessToken, setSessionEnder, setTokenRefresher } from './tokenRefresher';
import { getEmailFromAccessToken } from './tokenClaims';
import { getCurrentPath, type SigninState } from './signinReturnTo';
import { type SigninPageState } from './signinPageState';
import { useSignOutInOtherTab } from './useSignOutInOtherTab';
import { useSignInInOtherTab } from './useSignInInOtherTab';

const isOidcUserKey = (key: string) => key.startsWith('oidc.user:');

const LOGIN_SERVER_RETRY_MS = 30_000;

/**
 * The OIDC session for OidcAuthProvider: keeps the stored token in step with the user, renews it, ends
 * the session on a rejected renew or another tab's sign-out, and waits for an unreachable login server.
 * `isLoading` is true only while the stored session is first restored.
 */
export function useOidcAuth(userManager: UserManager): AuthContext {
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

  // The renew at expiry could not reach the login server (e.g. right after the machine wakes). The token
  // is gone, so the user shows as signed out until a retry below renews it or the IdP rejects it.
  const [isWaitingForLoginServer, setIsWaitingForLoginServer] = useState(false);

  // Ends the session in this tab. The `oidc.user:` key is shared, so the other tabs sign out too.
  // Also stops the retry: with no stored user it would sign in again through the hidden iframe.
  const { events, removeUser } = reactOidcAuth;
  const signOutHere = useCallback(() => {
    clearToken();
    setIsWaitingForLoginServer(false);
    return removeUser();
  }, [removeUser]);

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

  // One more try at the renew while waiting. Ends the wait unless the login server is still unreachable.
  const retryRenew = useCallback(async () => {
    const renew = await refreshAccessToken();
    if (renew.outcome === 'rejected') await signOutHere();
    if (renew.outcome !== 'unavailable') setIsWaitingForLoginServer(false);
    return renew.outcome;
  }, [signOutHere]);

  // Nothing else renews an expired token, so retry when the network or the tab comes back, and on a timer.
  useEffect(() => {
    if (!isWaitingForLoginServer) return;
    const retry = () => void retryRenew();
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
  }, [isWaitingForLoginServer, retryRenew]);

  // Another tab signed out. No silent renew: the IdP session may still be alive for a moment.
  useSignOutInOtherTab(isOidcUserKey, signOutHere);

  // Another tab signed in or renewed: take its user, so this tab shows the sign-in state its requests carry.
  const takeUserFromOtherTab = useCallback(async () => {
    const stored = await userManager.getUser();
    if (!stored || stored.expired) return;
    await userManager.events.load(stored);
    setIsWaitingForLoginServer(false);
  }, [userManager]);
  const onSignedInInOtherTab = useCallback(() => void takeUserFromOtherTab(), [takeUserFromOtherTab]);
  useSignInInOtherTab(isOidcUserKey, onSignedInInOtherTab);

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
      // No user, nothing to renew. signinSilent() would sign in through the hidden iframe instead, which
      // brings the user back while another tab's sign-out is still on its way to the IdP.
      if (!before) return { outcome: 'rejected' };
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
      // The token stays: it may still be valid (an early renew). Whoever ends the session clears it.
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

  const { t } = useTranslation('common');
  const { showNotification } = useNotifications();
  const redirectToLogin = (pageState?: SigninPageState) =>
    reactOidcAuth.signinRedirect({ state: { returnTo: getCurrentPath(), ...(pageState && { pageState }) } satisfies SigninState });

  // While waiting for the login server, try the renew first: a redirect would reload the page, or leave
  // it for a browser error page if the network is still down.
  const loginAfterWait = async (pageState?: SigninPageState) => {
    const outcome = await retryRenew();
    if (outcome === 'rejected') return redirectToLogin(pageState);
    if (outcome === 'unavailable') {
      showNotification({
        id: 'network_error',
        type: 'error',
        title: t('errors.network_error.title'),
        message: t('errors.network_error.login_server_message'),
      });
    }
  };

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
    login: pageState => void (isWaitingForLoginServer ? loginAfterWait(pageState) : redirectToLogin(pageState)),
    logout: () => {
      clearToken();
      reactOidcAuth.signoutRedirect();
    },
    authMode: AuthModes.OIDC,
    isEmailBasedAuth,
  };

  return value;
}
