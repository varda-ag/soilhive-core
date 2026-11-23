/**
 * The token cookie is scoped to APP_BASE_PATH (ADR 0084). The base path is read
 * once at module load, so each case re-imports the store with a fresh window._env_.
 */
const loadTokenStore = async (appBasePath?: string, env: Record<string, string> = {}) => {
  jest.resetModules();
  (window as unknown as { _env_?: Record<string, string> })._env_ = {
    ...(appBasePath === undefined ? {} : { APP_BASE_PATH: appBasePath }),
    ...env,
  };
  return import('../../src/auth/tokenStore');
};

const cookieWrites = () => {
  const set = jest.spyOn(document, 'cookie', 'set');
  return () => set.mock.calls.map(([value]) => value);
};

afterEach(() => {
  delete (window as unknown as { _env_?: Record<string, string> })._env_;
  localStorage.clear();
  jest.restoreAllMocks();
});

it('sets and clears the cookie at the domain root by default', async () => {
  const { saveToken, clearToken } = await loadTokenStore();
  const writes = cookieWrites();

  saveToken('abc');
  clearToken();

  expect(writes()).toEqual([expect.stringMatching(/^token=abc; path=\/; /), expect.stringMatching(/^token=; path=\/; Max-Age=0/)]);
});

it('sets and clears the cookie under the base path, and expires the one a root deployment left at /', async () => {
  const { saveToken, clearToken } = await loadTokenStore('/app');
  const writes = cookieWrites();

  saveToken('abc');
  clearToken();

  expect(writes()).toEqual([
    expect.stringMatching(/^token=abc; path=\/app; /),
    expect.stringMatching(/^token=; path=\/; Max-Age=0/),
    expect.stringMatching(/^token=; path=\/app; Max-Age=0/),
    expect.stringMatching(/^token=; path=\/; Max-Age=0/),
  ]);
});

it('expires the root cookie with the same domain it was set with', async () => {
  const { clearToken } = await loadTokenStore('/app', { COOKIE_DOMAIN: 'example.com' });
  const writes = cookieWrites();

  clearToken();

  expect(writes()).toEqual([
    expect.stringMatching(/^token=; path=\/app; Max-Age=0; SameSite=Lax; domain=example\.com/),
    expect.stringMatching(/^token=; path=\/; Max-Age=0; SameSite=Lax; domain=example\.com/),
  ]);
});
