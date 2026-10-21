import { getPluginToken, getPluginTokenOwner, renewPluginToken, resetPluginTokens } from '../../src/auth/pluginTokens';
import { getToken } from '../../src/auth/tokenStore';
import { refreshAccessToken } from '../../src/auth/tokenRefresher';
import { httpClient } from '../../src/api-client/httpClient';

jest.mock('configuration/api', () => ({
  ...jest.requireActual('configuration/api'),
  BACKEND_BASE_URL: 'https://api.example/api/v1',
}));
jest.mock('../../src/auth/tokenStore', () => ({ getToken: jest.fn() }));
jest.mock('../../src/api-client/httpClient', () => ({ httpClient: jest.fn() }));
jest.mock('../../src/auth/tokenRefresher', () => ({ refreshAccessToken: jest.fn() }));

const getTokenMock = getToken as jest.Mock;
const httpClientMock = httpClient as jest.Mock;
const refreshMock = refreshAccessToken as jest.Mock;

// An unsigned JWT: the cache only decodes the user token, it never verifies it
const userToken = (claims: { iss?: string; sub?: string; exp?: number }) =>
  ['{"alg":"none"}', JSON.stringify(claims), ''].map(part => btoa(part).replace(/=+$/, '')).join('.');
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

const MINT_URL = 'https://api.example/api/v1/plugins/zones/token';

// A mint whose reply the test sends when it wants
const deferredMint = () => {
  let resolve!: (value: { access_token: string; expires_in: number }) => void;
  let reject!: (error: unknown) => void;
  httpClientMock.mockReturnValueOnce(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { resolve, reject };
};

const minted = (access_token: string, expires_in = 300) => httpClientMock.mockResolvedValueOnce({ access_token, expires_in });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPluginTokens();
  getTokenMock.mockReturnValue('user-a');
  refreshMock.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getPluginToken', () => {
  it('mints a token for the plugin with the user token, then reuses it', async () => {
    minted('pt-1');

    expect(await getPluginToken('zones')).toBe('pt-1');
    expect(await getPluginToken('zones')).toBe('pt-1');

    expect(httpClientMock).toHaveBeenCalledTimes(1);
    expect(httpClientMock).toHaveBeenCalledWith({ url: MINT_URL, method: 'POST' });
  });

  it('encodes the pluginId as one path segment', async () => {
    minted('pt-1');
    await getPluginToken('a/b c');
    expect(httpClientMock.mock.calls[0][0].url).toBe('https://api.example/api/v1/plugins/a%2Fb%20c/token');
  });

  it('never calls the core for an anonymous visitor', async () => {
    getTokenMock.mockReturnValue(null);
    expect(await getPluginToken('zones')).toBeNull();
    expect(httpClientMock).not.toHaveBeenCalled();
  });

  it('forgets the tokens of a user who signed out', async () => {
    minted('pt-1');
    await getPluginToken('zones');
    getTokenMock.mockReturnValue(null);
    await getPluginToken('zones');
    getTokenMock.mockReturnValue('user-a');
    minted('pt-2');

    expect(await getPluginToken('zones')).toBe('pt-2');
  });

  it('shares one mint between concurrent callers', async () => {
    const mint = deferredMint();
    const first = getPluginToken('zones');
    const second = getPluginToken('zones');
    mint.resolve({ access_token: 'pt-1', expires_in: 300 });

    expect(await Promise.all([first, second])).toEqual(['pt-1', 'pt-1']);
    expect(httpClientMock).toHaveBeenCalledTimes(1);
  });

  it('keeps one mint per plugin', async () => {
    minted('pt-zones');
    minted('pt-other');
    expect(await getPluginToken('zones')).toBe('pt-zones');
    expect(await getPluginToken('other')).toBe('pt-other');
  });

  it('renews 30 s before expiry, on the local clock', async () => {
    minted('pt-1', 300);
    await getPluginToken('zones');

    jest.advanceTimersByTime(269_000);
    expect(await getPluginToken('zones')).toBe('pt-1');

    minted('pt-2');
    jest.advanceTimersByTime(2_000);
    expect(await getPluginToken('zones')).toBe('pt-2');
  });

  it('renews a short-lived token at half its life rather than at once', async () => {
    minted('pt-1', 20);
    await getPluginToken('zones');
    jest.advanceTimersByTime(9_000);
    expect(await getPluginToken('zones')).toBe('pt-1');
  });

  it('does not cache a failed mint', async () => {
    httpClientMock.mockRejectedValueOnce({ status: 503, message: 'Plugin tokens are not configured' });
    await expect(getPluginToken('zones')).rejects.toMatchObject({ status: 503 });

    minted('pt-1');
    expect(await getPluginToken('zones')).toBe('pt-1');
  });

  it('lets one caller stop waiting without cancelling the mint for the others', async () => {
    const mint = deferredMint();
    const controller = new AbortController();
    const aborted = getPluginToken('zones', controller.signal);
    const other = getPluginToken('zones');

    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    mint.resolve({ access_token: 'pt-1', expires_in: 300 });
    expect(await other).toBe('pt-1');
  });

  describe('when the user changes during a mint', () => {
    it("never hands user A's token to the call that started it", async () => {
      const mint = deferredMint();
      const call = getPluginToken('zones');
      getTokenMock.mockReturnValue('user-b');
      mint.resolve({ access_token: 'pt-a', expires_in: 300 });

      await expect(call).rejects.toMatchObject({ status: 401 });
    });

    it('never stores it, nor lets user B join it', async () => {
      const mintA = deferredMint();
      const callA = getPluginToken('zones').catch(() => undefined);
      getTokenMock.mockReturnValue('user-b');
      minted('pt-b');
      const callB = getPluginToken('zones');
      mintA.resolve({ access_token: 'pt-a', expires_in: 300 });
      await callA;

      expect(await callB).toBe('pt-b');
      expect(await getPluginToken('zones')).toBe('pt-b');
    });
  });
});

describe('renewPluginToken', () => {
  it('mints a new token for a rejected one old enough', async () => {
    minted('pt-1');
    await getPluginToken('zones');
    jest.advanceTimersByTime(11_000);
    minted('pt-2');

    expect(await renewPluginToken('zones', 'pt-1')).toBe('pt-2');
    expect(await getPluginToken('zones')).toBe('pt-2');
  });

  it('gives up on a token minted moments ago: the backend refuses every token', async () => {
    minted('pt-1');
    await getPluginToken('zones');
    jest.advanceTimersByTime(1_000);

    expect(await renewPluginToken('zones', 'pt-1')).toBeNull();
    expect(httpClientMock).toHaveBeenCalledTimes(1);
  });

  it('returns the token another call already renewed', async () => {
    minted('pt-1');
    await getPluginToken('zones');
    jest.advanceTimersByTime(11_000);
    minted('pt-2');
    await renewPluginToken('zones', 'pt-1');

    expect(await renewPluginToken('zones', 'pt-1')).toBe('pt-2');
    expect(httpClientMock).toHaveBeenCalledTimes(2);
  });

  it('gives an anonymous visitor nothing', async () => {
    getTokenMock.mockReturnValue(null);
    expect(await renewPluginToken('zones', 'pt-1')).toBeNull();
  });
});

describe('the user the tokens belong to', () => {
  const IDP = 'https://idp.example/realms/soilhive';

  it('is the issuer and sub of the user token, so a silent renew keeps the Plugin tokens', async () => {
    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'alice', exp: inAnHour() }));
    minted('pt-1');
    await getPluginToken('zones');

    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'alice', exp: inAnHour() + 300 }));
    expect(await getPluginToken('zones')).toBe('pt-1');
    expect(httpClientMock).toHaveBeenCalledTimes(1);
  });

  it('starts over for another user', async () => {
    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'alice', exp: inAnHour() }));
    minted('pt-alice');
    await getPluginToken('zones');

    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'bob', exp: inAnHour() }));
    minted('pt-bob');
    expect(await getPluginToken('zones')).toBe('pt-bob');
  });

  it('lets a renew of the same user finish a mint it started', async () => {
    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'alice', exp: inAnHour() }));
    const mint = deferredMint();
    const call = getPluginToken('zones');
    getTokenMock.mockReturnValue(userToken({ iss: IDP, sub: 'alice', exp: inAnHour() + 300 }));
    mint.resolve({ access_token: 'pt-1', expires_in: 300 });

    expect(await call).toBe('pt-1');
  });

  it('falls back to the raw token when it is not a JWT', () => {
    getTokenMock.mockReturnValue('opaque');
    expect(getPluginTokenOwner()).toBe('opaque');
    getTokenMock.mockReturnValue(null);
    expect(getPluginTokenOwner()).toBeNull();
  });
});

describe('a user token about to expire', () => {
  it('is renewed before the mint, so the Plugin token is not cut short', async () => {
    getTokenMock.mockReturnValue(userToken({ sub: 'alice', exp: Math.floor(Date.now() / 1000) + 10 }));
    minted('pt-1');

    await getPluginToken('zones');

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock.mock.invocationCallOrder[0]).toBeLessThan(httpClientMock.mock.invocationCallOrder[0]);
  });

  it('is not renewed when it has time left', async () => {
    getTokenMock.mockReturnValue(userToken({ sub: 'alice', exp: inAnHour() }));
    minted('pt-1');
    await getPluginToken('zones');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('still gets a mint when the renew fails', async () => {
    getTokenMock.mockReturnValue(userToken({ sub: 'alice', exp: Math.floor(Date.now() / 1000) + 10 }));
    refreshMock.mockRejectedValueOnce(new Error('signinSilent failed'));
    minted('pt-1');
    expect(await getPluginToken('zones')).toBe('pt-1');
  });
});
