import { normaliseBasePath } from 'configuration/basePath';

/**
 * APP_BASE_PATH (ADR 0084). The module reads it once at load, so the cases on
 * BASE_PATH re-import it with a fresh window._env_.
 */
type BasePathModule = typeof import('configuration/basePath');

const loadBasePath = async (appBasePath?: string): Promise<BasePathModule> => {
  jest.resetModules();
  (window as unknown as { _env_?: Record<string, string> })._env_ = appBasePath === undefined ? {} : { APP_BASE_PATH: appBasePath };
  return import('configuration/basePath');
};

afterEach(() => {
  delete (window as unknown as { _env_?: Record<string, string> })._env_;
});

describe('normaliseBasePath', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['/', ''],
    ['//', ''],
    ['app', '/app'],
    ['/app', '/app'],
    ['/app/', '/app'],
    ['//app//', '/app'],
    ['/a/b', '/a/b'],
    ['/soil.hive_v-2', '/soil.hive_v-2'],
  ])('reads %p as %p', (raw, expected) => {
    expect(normaliseBasePath(raw)).toBe(expected);
  });

  it.each(['/my app', '/app?x=1', '/app#x', '/a//b', '/./app', '/app/..', 'https://example.com/app', '/àpp'])('refuses %p', raw => {
    expect(normaliseBasePath(raw)).toBeUndefined();
  });
});

describe('BASE_PATH', () => {
  it('is empty at the domain root', async () => {
    const { BASE_PATH, ROUTER_BASENAME, withBasePath } = await loadBasePath();

    expect(BASE_PATH).toBe('');
    expect(ROUTER_BASENAME).toBe('/');
    expect(withBasePath('/datasets/x')).toBe('/datasets/x');
  });

  it('is the normalised path when set', async () => {
    const { BASE_PATH, ROUTER_BASENAME, withBasePath } = await loadBasePath('app/');

    expect(BASE_PATH).toBe('/app');
    expect(ROUTER_BASENAME).toBe('/app');
    expect(withBasePath('/datasets/x')).toBe('/app/datasets/x');
    expect(withBasePath('/')).toBe('/app/');
  });

  it('falls back to the domain root for an unusable value, which the server refuses to start on', async () => {
    expect((await loadBasePath('/my app')).BASE_PATH).toBe('');
  });
});
