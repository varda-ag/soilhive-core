// useOidcAuth.userManager.test.tsx
//
// Runs useOidcAuth on the real oidc-client-ts UserManager and react-oidc-context provider, which
// OidcAuthProvider.test.tsx mocks away. Some behavior only shows with both:
//   - getUser() sets the accessTokenExpired event to fire again 1 s later for an expired user, so an
//     expiry handler that renewed on every event renewed every second while the login server was out of reach;
//   - which errors the real UserManager throws decides whether Log in may leave the page, and whether a
//     Log in or Log out that cannot reach the IdP says so.
import { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from 'react-oidc-context';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useOidcAuth } from '../../src/auth/useOidcAuth';

const mockShowNotification = jest.fn();
jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: () => ({ showNotification: mockShowNotification }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const AUTHORITY = 'https://idp.example.com/realms/soilhive';
const CLIENT_ID = 'soilhive';
const TOKEN_ENDPOINT = `${AUTHORITY}/protocol/openid-connect/token`;

// `knowsIdpConfig`: given the IdP's configuration, so the UserManager does not fetch it. Without it, the
// UserManager fetches it on first use, as in the app.
const buildUserManager = ({ knowsIdpConfig = true } = {}) =>
  new UserManager({
    authority: AUTHORITY,
    client_id: CLIENT_ID,
    redirect_uri: 'https://app.example.com/',
    silent_redirect_uri: 'https://app.example.com/',
    post_logout_redirect_uri: 'https://app.example.com/',
    automaticSilentRenew: false,
    // As in the app: the sign-out revokes the tokens before it leaves the page.
    revokeTokensOnSignout: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    ...(knowsIdpConfig && {
      metadata: { issuer: AUTHORITY, authorization_endpoint: `${AUTHORITY}/protocol/openid-connect/auth`, token_endpoint: TOKEN_ENDPOINT },
    }),
  });

const USER_KEY = `oidc.user:${AUTHORITY}:${CLIENT_ID}`;

// With a refresh token, so the renew is a request to the token endpoint, as with Keycloak.
const storeUser = ({ expired }: { expired: boolean }) => {
  const user = new User({
    access_token: expired ? 'expired-token' : 'valid-token',
    token_type: 'Bearer',
    refresh_token: 'refresh-token',
    scope: 'openid',
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
    profile: { sub: 'user-1', iss: AUTHORITY, aud: CLIENT_ID, exp: 0, iat: 0 },
  });
  localStorage.setItem(USER_KEY, user.toStorageString());
};

const renderUseOidcAuth = (userManager: UserManager) =>
  renderHook(() => useOidcAuth(userManager), {
    wrapper: ({ children }: { children: ReactNode }) => <AuthProvider userManager={userManager}>{children}</AuthProvider>,
  }).result;

const renderWithExpiredUser = () => {
  storeUser({ expired: true });
  const userManager = buildUserManager();
  return { userManager, result: renderUseOidcAuth(userManager) };
};

// What a proxy in front of a stopped IdP sends back.
const serverErrorPage = () => ({
  ok: false,
  status: 503,
  statusText: 'Service Unavailable',
  headers: new Map([['Content-Type', 'text/html']]),
  text: async () => '<html><body>Service Unavailable</body></html>',
});

const loginServerUnreachable = {
  id: 'network_error',
  type: 'error',
  title: 'errors.network_error.title',
  message: 'errors.network_error.login_server_message',
};

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
const tokenRequests = () => fetchMock.mock.calls.filter(([url]) => String(url) === TOKEN_ENDPOINT).length;

// One second per act(): act() holds React updates until it ends, so a longer step would start the
// timers that an update sets up (e.g. the 30 s retry) late.
const advanceSeconds = async (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  mockShowNotification.mockClear();
  // The renew and the sign-in log each request that gets no answer from the IdP.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  global.fetch = originalFetch;
  localStorage.clear();
});

describe('useOidcAuth with a real UserManager', () => {
  it('renews once, then every 30 seconds, while the login server cannot be reached', async () => {
    renderWithExpiredUser();

    // The expiry event fires about 1 s after the expired user loads, and the wait starts then.
    await advanceSeconds(10);
    expect(tokenRequests()).toBe(1);

    // The 30 s retry.
    await advanceSeconds(25);
    expect(tokenRequests()).toBe(2);
  });

  // signinRedirect() fetches the IdP's configuration before it leaves the page, so it fails while the
  // IdP is down. react-oidc-context would hide that, and the click would do nothing.
  it('says the login server is unreachable when Log in cannot reach the IdP', async () => {
    const result = renderUseOidcAuth(buildUserManager({ knowsIdpConfig: false }));
    await advanceSeconds(1);

    await act(async () => {
      result.current.login();
    });
    await advanceSeconds(1);

    expect(mockShowNotification).toHaveBeenCalledWith(loginServerUnreachable);
  });

  // signoutRedirect() revokes the tokens before it removes the user, so offline it fails with the user
  // still stored, and react-oidc-context would hide that: the user stayed signed in.
  it('signs out on this device when Log out cannot reach the IdP', async () => {
    storeUser({ expired: false });
    const result = renderUseOidcAuth(buildUserManager({ knowsIdpConfig: false }));
    await advanceSeconds(1);
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      result.current.logout();
    });
    await advanceSeconds(1);

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'signed_out_on_this_device' }));
  });

  describe('Log in after a failed renew', () => {
    const clickLogin = async ({ userManager, result }: ReturnType<typeof renderWithExpiredUser>) => {
      const signinRedirect = jest.spyOn(userManager, 'signinRedirect').mockResolvedValue(undefined);
      // The renew at expiry fails, so the hook waits for the login server.
      await advanceSeconds(3);
      expect(result.current.isAuthenticated).toBe(false);
      await act(async () => {
        result.current.login();
      });
      await advanceSeconds(1);
      return signinRedirect;
    };

    it('stays on the page and says so when the renew gets no response', async () => {
      expect(await clickLogin(renderWithExpiredUser())).not.toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith(loginServerUnreachable);
    });

    // Every renew would get the same page, and a reload would bring the stored user back.
    it('goes to the login page when the renew gets a server error page', async () => {
      fetchMock.mockResolvedValue(serverErrorPage());

      expect(await clickLogin(renderWithExpiredUser())).toHaveBeenCalledTimes(1);
    });
  });
});
