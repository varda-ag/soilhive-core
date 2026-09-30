// OidcAuthProvider.test.tsx
//
// Covers the OIDC token-expiry handling in AuthContextProvider (see ADR 0006):
//   1. the save-effect is gated on validity, so an expired token is never persisted;
//   2. the `accessTokenExpired` event (which react-oidc-context ignores) drives
//      clearToken() + removeUser() — a quiet logout.
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
import { setTokenRefresher } from '../../src/auth/tokenRefresher';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-oidc-context', () => ({
  // Passthrough provider — the real one only wires up the UserManager, which we mock away.
  // A jest.fn so a test can read the props it was given (e.g. onSigninCallback).
  AuthProvider: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  useAuth: jest.fn(),
}));

jest.mock('oidc-client-ts', () => ({
  WebStorageStateStore: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('../../src/auth/tokenStore', () => ({
  saveToken: jest.fn(),
  clearToken: jest.fn(),
  getToken: jest.fn(),
}));

jest.mock('../../src/auth/tokenRefresher', () => ({
  setTokenRefresher: jest.fn(),
}));

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
let capturedExpiredHandler: (() => void) | undefined;
const removeUser = jest.fn().mockResolvedValue(undefined);
const addAccessTokenExpired = jest.fn((h: () => void) => {
  capturedExpiredHandler = h;
});
const removeAccessTokenExpired = jest.fn();
const signinSilent = jest.fn();

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
const getRegisteredRefresher = (): (() => Promise<string | undefined>) => {
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

    it('clears the token and removes the user when the token expires', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      // saved on mount; reset so we assert only the expiry-driven call
      (clearToken as jest.Mock).mockClear();

      await act(async () => {
        capturedExpiredHandler?.();
      });

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(removeUser).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from the event on unmount', () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });

      unmount();

      expect(removeAccessTokenExpired).toHaveBeenCalledTimes(1);
      expect(removeAccessTokenExpired).toHaveBeenCalledWith(capturedExpiredHandler);
    });
  });

  describe('silent-refresh registration', () => {
    it('registers a refresher that silently renews and persists the fresh token', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue({ access_token: 'fresh-token', expired: false });
      (saveToken as jest.Mock).mockClear();

      const refresher = getRegisteredRefresher();
      let result: string | undefined;
      await act(async () => {
        result = await refresher();
      });

      expect(signinSilent).toHaveBeenCalledTimes(1);
      expect(saveToken).toHaveBeenCalledWith('fresh-token');
      expect(result).toBe('fresh-token');
    });

    it('clears the token and returns undefined when the silent renew yields no valid user', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue(null);
      (clearToken as jest.Mock).mockClear();
      (saveToken as jest.Mock).mockClear();

      const refresher = getRegisteredRefresher();
      let result: string | undefined;
      await act(async () => {
        result = await refresher();
      });

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(saveToken).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('treats an expired renewed user as a failed refresh', async () => {
      renderWithUser({ access_token: 'valid-token', expired: false });
      signinSilent.mockResolvedValue({ access_token: 'stale-token', expired: true });
      (saveToken as jest.Mock).mockClear();

      const refresher = getRegisteredRefresher();
      let result: string | undefined;
      await act(async () => {
        result = await refresher();
      });

      expect(result).toBeUndefined();
      expect(saveToken).not.toHaveBeenCalled();
    });

    it('unregisters the refresher on unmount', () => {
      const { unmount } = renderWithUser({ access_token: 'valid-token', expired: false });
      (setTokenRefresher as jest.Mock).mockClear();

      unmount();

      expect(setTokenRefresher).toHaveBeenCalledWith(undefined);
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
