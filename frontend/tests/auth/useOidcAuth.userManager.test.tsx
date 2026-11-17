// useOidcAuth.userManager.test.tsx
//
// Runs useOidcAuth on the real oidc-client-ts UserManager and react-oidc-context provider, which
// OidcAuthProvider.test.tsx mocks away. Some behavior only shows with both: getUser() sets the
// accessTokenExpired event to fire again 1 s later for an expired user, so an expiry handler that
// renewed on every event renewed every second while the login server could not be reached.
import { render, act } from '@testing-library/react';
import { AuthProvider } from 'react-oidc-context';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useOidcAuth } from '../../src/auth/useOidcAuth';

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: () => ({ showNotification: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const AUTHORITY = 'https://idp.example.com/realms/soilhive';
const CLIENT_ID = 'soilhive';
const TOKEN_ENDPOINT = `${AUTHORITY}/protocol/openid-connect/token`;

const buildUserManager = () =>
  new UserManager({
    authority: AUTHORITY,
    client_id: CLIENT_ID,
    redirect_uri: 'https://app.example.com/',
    silent_redirect_uri: 'https://app.example.com/',
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    // Given here, so the UserManager makes no discovery request.
    metadata: { issuer: AUTHORITY, authorization_endpoint: `${AUTHORITY}/protocol/openid-connect/auth`, token_endpoint: TOKEN_ENDPOINT },
  });

// With a refresh token, so the renew is a request to the token endpoint, as with Keycloak.
const storeExpiredUser = () => {
  const user = new User({
    access_token: 'expired-token',
    token_type: 'Bearer',
    refresh_token: 'refresh-token',
    scope: 'openid',
    expires_at: Math.floor(Date.now() / 1000) - 60,
    profile: { sub: 'user-1', iss: AUTHORITY, aud: CLIENT_ID, exp: 0, iat: 0 },
  });
  localStorage.setItem(`oidc.user:${AUTHORITY}:${CLIENT_ID}`, user.toStorageString());
};

const UseOidcAuth = ({ userManager }: { userManager: UserManager }) => {
  useOidcAuth(userManager);
  return null;
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
  // The renew logs each request that cannot reach the login server.
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
    storeExpiredUser();
    const userManager = buildUserManager();
    render(
      <AuthProvider userManager={userManager}>
        <UseOidcAuth userManager={userManager} />
      </AuthProvider>,
    );

    // The expiry event fires about 1 s after the expired user loads, and the wait starts then.
    await advanceSeconds(10);
    expect(tokenRequests()).toBe(1);

    // The 30 s retry.
    await advanceSeconds(25);
    expect(tokenRequests()).toBe(2);
  });
});
