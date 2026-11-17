// OidcAuthProvider.test.tsx
//
// Covers the OIDC token-expiry handling in AuthContextProvider (see ADR 0006):
//   1. the save-effect is gated on validity, so an expired token is never persisted;
//   2. the `accessTokenExpired` event (which react-oidc-context ignores) drives a
//      silent renew, and only if that fails clearToken() + removeUser() — a quiet logout.
//
// OidcAuthProvider is not exported, so it is exercised through AuthContextProvider
// rendered in OIDC mode.
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { AuthContextProvider } from '../../src/auth/AuthContextProvider';
import { AuthProvider as ReactOidcProvider, useAuth as useReactOidcAuth } from 'react-oidc-context';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { useApiQuery } from 'hooks/useApiQuery';
import { saveToken, clearToken } from '../../src/auth/tokenStore';
import { endSession, setTokenRefresher, type RenewResult } from '../../src/auth/tokenRefresher';
import { peekRestoredPageState, setRestoredPageState } from '../../src/auth/signinPageState';
import { ErrorResponse, UserManager } from 'oidc-client-ts';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-oidc-context', () => ({
  // Passthrough provider — the real one only wires up the UserManager, which we mock away.
  // A jest.fn so a test can read the props it was given (e.g. onSigninCallback).
  AuthProvider: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  useAuth: jest.fn(),
}));

// The app builds the UserManager itself, so its renew can tell an IdP rejection from a timeout.
const mockSigninSilent = jest.fn();
const mockStartSilentRenew = jest.fn();
const mockStopSilentRenew = jest.fn();
const mockGetUser = jest.fn();
const mockLoadUser = jest.fn();
jest.mock('oidc-client-ts', () => ({
  WebStorageStateStore: jest.fn().mockImplementation(() => ({})),
  UserManager: jest.fn().mockImplementation(() => ({
    signinSilent: mockSigninSilent,
    startSilentRenew: mockStartSilentRenew,
    stopSilentRenew: mockStopSilentRenew,
    getUser: mockGetUser,
    events: { load: mockLoadUser },
  })),
  ErrorResponse: class ErrorResponse extends Error {},
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('../../src/auth/tokenStore', () => ({
  saveToken: jest.fn(),
  clearToken: jest.fn(),
  getToken: jest.fn(),
}));

// The real module, so the expiry handler's refreshAccessToken() reaches the refresher the provider
// registers; setTokenRefresher is wrapped so a test can read what was registered.
jest.mock('../../src/auth/tokenRefresher', () => {
  const actual = jest.requireActual('../../src/auth/tokenRefresher');
  return { ...actual, setTokenRefresher: jest.fn(actual.setTokenRefresher) };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const OIDC_CONFIG = {
  authority: 'https://idp.example.com',
  clientId: 'client',
  redirectUri: 'https://app.example.com/admin',
  postLogoutRedirectUri: 'https://app.example.com',
  silentRedirectUri: 'https://app.example.com',
  scope: 'openid',
};

// Captures the handler passed to addAccessTokenExpired so a test can fire it.
let capturedExpiredHandler: (() => Promise<void>) | undefined;
const removeUser = jest.fn().mockResolvedValue(undefined);
const addAccessTokenExpired = jest.fn((h: () => Promise<void>) => {
  capturedExpiredHandler = h;
});
const removeAccessTokenExpired = jest.fn();
const signinSilent = mockSigninSilent;
const rejected = () => new (ErrorResponse as unknown as new (m: string) => Error)('login_required');

type OidcUser = { access_token: string; expired: boolean } | null | undefined;

const signinRedirect = jest.fn();

const buildAuth = (user: OidcUser) => ({
  isAuthenticated: !!user && !user.expired,
  isLoading: false,
  error: undefined,
  user,
  signinRedirect,
  signoutRedirect: jest.fn(),
  signinSilent,
  removeUser,
  events: { addAccessTokenExpired, removeAccessTokenExpired },
});

// Returns the latest refresher registered via setTokenRefresher.
const getRegisteredRefresher = (): (() => Promise<RenewResult>) => {
  const calls = (setTokenRefresher as jest.Mock).mock.calls.filter(([fn]) => typeof fn === 'function');
  return calls[calls.length - 1][0];
};

const renderWithUser = (user: OidcUser) => {
  (useReactOidcAuth as jest.Mock).mockReturnValue(buildAuth(user));
  return render(
    <AuthContextProvider>
      <div>child</div>
    </AuthContextProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  capturedExpiredHandler = undefined;
  (useApiQuery as jest.Mock).mockReturnValue({
    data: { authMode: 'oidc', oidcConfig: OIDC_CONFIG },
    isLoading: false,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OidcAuthProvider token lifecycle', () => {
  describe('save-effect validity gating', () => {
    it('persists a valid (non-expired) access token', () => {
      renderWithUser({ access_token: 'valid-token', expired: false });

      expect(saveToken).toHaveBeenCalledWith('valid-token');
      expect(clearToken).not.toHaveBeenCalled();
    });

    it('does NOT persist an expired token and clears any stored one', () => {
      renderWithUser({ access_token: 'stale-token', expired: true });

      expect(saveToken).not.toHaveBeenCalled();
      expect(clearToken).toHaveBeenCalledTimes(1);
    });

    it('clears the token when there is no user', () => {
      renderWithUser(null);

      expect(saveToken).not.toHaveBeenCalled();
      expect(clearToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessTokenExpired handling', () => {
    it('subscribes to the accessTokenExpired event on mount', () => {
      renderWithUser({ access_token: 'valid-token', expired: false });

      expect(addAccessTokenExpired).toHaveBeenCalledTimes(1);
      expect(typeof capturedExpiredHandler).toBe('function');
    });

    it('keeps the user signed in when a silent renew succeeds on expiry', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue({ access_token: 'fresh-token', expired: false });
      (clearToken as jest.Mock).mockClear();

      await act(async () => {
        await capturedExpiredHandler?.();
      });

      expect(signinSilent).toHaveBeenCalledTimes(1);
      expect(saveToken).toHaveBeenCalledWith('fresh-token');
      expect(clearToken).not.toHaveBeenCalled();
      expect(removeUser).not.toHaveBeenCalled();
    });

    it('clears the token and removes the user when the IdP rejects the renew on expiry', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockRejectedValue(rejected());
      // saved on mount; reset so we assert only the expiry-driven calls
      (clearToken as jest.Mock).mockClear();

      await act(async () => {
        await capturedExpiredHandler?.();
      });

      expect(signinSilent).toHaveBeenCalledTimes(1);
      expect(clearToken).toHaveBeenCalled();
      expect(removeUser).toHaveBeenCalledTimes(1);
    });

    it('keeps the user when the renew on expiry cannot reach the IdP', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockRejectedValue(new TypeError('Failed to fetch'));

      await act(async () => {
        await capturedExpiredHandler?.();
      });

      expect(removeUser).not.toHaveBeenCalled();
    });

    it('unsubscribes from the event on unmount', () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });

      unmount();

      expect(removeAccessTokenExpired).toHaveBeenCalledTimes(1);
      expect(removeAccessTokenExpired).toHaveBeenCalledWith(capturedExpiredHandler);
    });
  });

  describe('sign-out in another tab', () => {
    const fireStorage = (key: string | null) => {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null, storageArea: localStorage }));
    };

    it('clears the token and removes the user when another tab removes the OIDC user', () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      (clearToken as jest.Mock).mockClear();

      act(() => fireStorage('oidc.user:https://idp.example.com:client'));

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(removeUser).toHaveBeenCalledTimes(1);
      expect(signinSilent).not.toHaveBeenCalled();
    });

    it('stays signed in when another tab only removes its token (its own copy expired)', () => {
      renderWithUser({ access_token: 'valid-token', expired: false });

      act(() => fireStorage('token'));

      expect(removeUser).not.toHaveBeenCalled();
    });
  });

  describe('silent-refresh registration', () => {
    const runRefresher = async () => {
      let result: RenewResult | undefined;
      await act(async () => {
        result = await getRegisteredRefresher()();
      });
      return result;
    };

    it('builds the UserManager from the OIDC config and hands it to react-oidc-context', () => {
      renderWithUser({ access_token: 'valid-token', expired: false });

      expect(UserManager).toHaveBeenCalledWith(
        expect.objectContaining({ authority: OIDC_CONFIG.authority, client_id: OIDC_CONFIG.clientId, automaticSilentRenew: false }),
      );
      const props = (ReactOidcProvider as unknown as jest.Mock).mock.calls[0][0];
      expect(props.userManager).toBe((UserManager as jest.Mock).mock.results[0].value);
    });

    // Not by the constructor: StrictMode builds the memo twice, and only the kept instance may renew.
    it('starts the automatic silent renew on mount and stops it on unmount', () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });
      expect(mockStartSilentRenew).toHaveBeenCalledTimes(1);
      expect(mockStopSilentRenew).not.toHaveBeenCalled();

      unmount();

      expect(mockStopSilentRenew).toHaveBeenCalledTimes(1);
    });

    it('registers a refresher that silently renews and persists the fresh token', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue({ access_token: 'fresh-token', expired: false });
      (saveToken as jest.Mock).mockClear();

      expect(await runRefresher()).toEqual({ outcome: 'renewed', token: 'fresh-token' });
      expect(saveToken).toHaveBeenCalledWith('fresh-token');
      expect(removeUser).not.toHaveBeenCalled();
    });

    // A proactive renew (pluginTokens) also calls the refresher, so even a rejection must not end the session here.
    it('reports a rejection and clears the token when the IdP rejects the renew', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockRejectedValue(rejected());
      (clearToken as jest.Mock).mockClear();

      expect(await runRefresher()).toEqual({ outcome: 'rejected' });
      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(removeUser).not.toHaveBeenCalled();
    });

    // With refresh-token rotation, two tabs renewing at once make the slower one get invalid_grant.
    it('uses the token another tab just renewed when the IdP rejects this renew', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      const winner = { access_token: 'other-tab-token', expired: false };
      mockGetUser.mockResolvedValueOnce({ access_token: 'valid-token', expired: false }).mockResolvedValueOnce(winner);
      signinSilent.mockRejectedValue(rejected());
      (clearToken as jest.Mock).mockClear();

      expect(await runRefresher()).toEqual({ outcome: 'renewed', token: 'other-tab-token' });
      expect(saveToken).toHaveBeenCalledWith('other-tab-token');
      expect(mockLoadUser).toHaveBeenCalledWith(winner);
      expect(clearToken).not.toHaveBeenCalled();
    });

    it.each([
      ['still holds the token this renew used', { access_token: 'valid-token', expired: false }],
      ['holds an expired token', { access_token: 'other-tab-token', expired: true }],
      ['holds no user', null],
    ])('reports a rejection when the IdP rejects the renew and storage %s', async (_, stored) => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      mockGetUser.mockResolvedValueOnce({ access_token: 'valid-token', expired: false }).mockResolvedValueOnce(stored);
      signinSilent.mockRejectedValue(rejected());

      expect(await runRefresher()).toEqual({ outcome: 'rejected' });
      expect(mockLoadUser).not.toHaveBeenCalled();
    });

    it.each([
      ['a network error', new TypeError('Failed to fetch')],
      ['a timeout', new Error('Timed out')],
    ])('reports the IdP as unavailable and keeps the token on %s', async (_, error) => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockRejectedValue(error);
      (clearToken as jest.Mock).mockClear();

      expect(await runRefresher()).toEqual({ outcome: 'unavailable' });
      expect(clearToken).not.toHaveBeenCalled();
      expect(removeUser).not.toHaveBeenCalled();
    });

    it('treats an expired renewed user as a rejection', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue({ access_token: 'stale-token', expired: true });
      (saveToken as jest.Mock).mockClear();

      expect(await runRefresher()).toEqual({ outcome: 'rejected' });
      expect(saveToken).not.toHaveBeenCalled();
    });

    it('unregisters the refresher on unmount', () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });
      (setTokenRefresher as jest.Mock).mockClear();

      unmount();

      expect(setTokenRefresher).toHaveBeenCalledWith(undefined);
    });
  });

  describe('session end after a 401 the renew cannot fix', () => {
    // The `oidc.user:` key is shared, so the other tabs sign out too, even when the renew failed only
    // because the network dropped for a moment. Accepted: this tab already signed out before.
    it('clears the token and removes the user (also in the other tabs)', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      (clearToken as jest.Mock).mockClear();

      await act(async () => {
        endSession();
      });

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(removeUser).toHaveBeenCalledTimes(1);
    });

    it('stops ending the session after unmount', async () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });
      unmount();

      await act(async () => {
        endSession();
      });

      expect(removeUser).not.toHaveBeenCalled();
    });
  });

  describe('return to the page the sign-in started from', () => {
    const getOnSigninCallback = (): ((user: { state?: unknown } | undefined) => void) => {
      const calls = (ReactOidcProvider as unknown as jest.Mock).mock.calls;
      return calls[calls.length - 1][0].onSigninCallback;
    };

    it('sends the current path, query and hash as the sign-in state', () => {
      window.history.replaceState({}, '', '/dashboards/abc?tab=2#w');
      const LoginTrigger = () => {
        const { login } = useAuthContext();
        return <button onClick={() => login()}>login</button>;
      };
      (useReactOidcAuth as jest.Mock).mockReturnValue(buildAuth(null));
      const { getByRole } = render(
        <AuthContextProvider>
          <LoginTrigger />
        </AuthContextProvider>,
      );

      fireEvent.click(getByRole('button', { name: 'login' }));

      expect(signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/dashboards/abc?tab=2#w' } });
    });

    it('carries the page state the caller gives beside the current path', () => {
      window.history.replaceState({}, '', '/');
      const pageState = { availabilityMap: { locationName: 'Nakuru, Kenya' } };
      const LoginTrigger = () => {
        const { login } = useAuthContext();
        return <button onClick={() => login(pageState)}>login</button>;
      };
      (useReactOidcAuth as jest.Mock).mockReturnValue(buildAuth(null));
      const { getByRole } = render(
        <AuthContextProvider>
          <LoginTrigger />
        </AuthContextProvider>,
      );

      fireEvent.click(getByRole('button', { name: 'login' }));

      expect(signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/', pageState } });
    });

    it('hands the page state back on the sign-in callback, for the pages to put back when they mount', () => {
      renderWithUser(null);
      window.history.replaceState({}, '', '/?code=abc&state=xyz');

      getOnSigninCallback()({ state: { returnTo: '/', pageState: { availabilityMap: { locationName: 'Nakuru, Kenya' } } } });

      expect(peekRestoredPageState('availabilityMap')).toEqual({ locationName: 'Nakuru, Kenya' });
    });

    it('hands back nothing after a sign-in started without page state', () => {
      setRestoredPageState({ availabilityMap: { locationName: 'from an earlier sign-in' } });
      renderWithUser(null);
      window.history.replaceState({}, '', '/?code=abc&state=xyz');

      getOnSigninCallback()({ state: { returnTo: '/' } });

      expect(peekRestoredPageState('availabilityMap')).toBeUndefined();
    });

    it('restores the recorded path on the sign-in callback', () => {
      renderWithUser(null);
      window.history.replaceState({}, '', '/admin?code=abc&state=xyz');

      getOnSigninCallback()({ state: { returnTo: '/dashboards/abc?tab=2' } });

      expect(window.location.pathname + window.location.search).toBe('/dashboards/abc?tab=2');
    });

    it('only strips the callback params when there is no usable recorded path', () => {
      renderWithUser(null);
      window.history.replaceState({}, '', '/admin?code=abc&state=xyz');

      getOnSigninCallback()({ state: { returnTo: '//evil.example/' } });

      expect(window.location.pathname + window.location.search).toBe('/admin');
    });

    it("strips a failed callback's params before the app mounts", () => {
      window.history.replaceState({}, '', '/admin?tab=2&error=access_denied&state=xyz');
      const urlsSeenByApp: string[] = [];
      const App = () => {
        urlsSeenByApp.push(window.location.pathname + window.location.search);
        return null;
      };
      (useReactOidcAuth as jest.Mock).mockReturnValue({ ...buildAuth(null), error: { source: 'signinCallback' } });

      render(
        <AuthContextProvider>
          <App />
        </AuthContextProvider>,
      );

      expect(window.location.pathname + window.location.search).toBe('/admin?tab=2');
      expect(urlsSeenByApp).toEqual(['/admin?tab=2']);
    });
  });

  describe('exposed user', () => {
    const UserState = () => <span data-testid="user">{useAuthContext().user?.access_token ?? 'none'}</span>;

    const renderUserState = (user: OidcUser) => {
      (useReactOidcAuth as jest.Mock).mockReturnValue(buildAuth(user));
      return render(
        <AuthContextProvider>
          <UserState />
        </AuthContextProvider>,
      );
    };

    it('exposes the user while authenticated', () => {
      const { getByTestId } = renderUserState({ access_token: 'valid-token', expired: false });

      expect(getByTestId('user')).toHaveTextContent('valid-token');
    });

    it('hides an expired user restored from storage', () => {
      const { getByTestId } = renderUserState({ access_token: 'stale-token', expired: true });

      expect(getByTestId('user')).toHaveTextContent('none');
    });
  });

  describe('loading gate', () => {
    const AuthState = () => <span data-testid="loading">{String(useAuthContext().isLoading)}</span>;

    const renderWhileLoading = (activeNavigator?: string) => {
      (useReactOidcAuth as jest.Mock).mockReturnValue({
        ...buildAuth({ access_token: 'valid-token', expired: false }),
        isLoading: true,
        activeNavigator,
      });
      return render(
        <AuthContextProvider>
          <AuthState />
        </AuthContextProvider>,
      );
    };

    it('hides the app while the initial session is being restored', () => {
      const { queryByTestId } = renderWhileLoading();

      expect(queryByTestId('loading')).not.toBeInTheDocument();
    });

    it('keeps the app mounted and not loading during a silent renew', () => {
      const { getByTestId } = renderWhileLoading('signinSilent');

      expect(getByTestId('loading')).toHaveTextContent('false');
    });
  });
});
