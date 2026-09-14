/**
 * Browser-side behaviour of configuration/routes. APP_BASE_URL is read once at
 * module load, so every case re-imports the module with a fresh window._env_.
 */
type RoutesModule = typeof import('configuration/routes');

const loadRoutes = async (appBaseUrl?: string): Promise<RoutesModule> => {
  jest.resetModules();
  (window as unknown as { _env_?: Record<string, string> })._env_ = appBaseUrl === undefined ? {} : { APP_BASE_URL: appBaseUrl };
  return import('configuration/routes');
};

afterEach(() => {
  delete (window as unknown as { _env_?: Record<string, string> })._env_;
  jest.restoreAllMocks();
});

describe('metadataPath', () => {
  it('builds an in-app path without the configured base', async () => {
    expect((await loadRoutes('https://soil.example.com')).metadataPath('my-dataset')).toBe('/datasets/my-dataset');
  });

  it('percent-encodes an id that is not URL-safe', async () => {
    expect((await loadRoutes()).metadataPath('a b/c')).toBe('/datasets/a%20b%2Fc');
  });
});

describe('appBaseUrl', () => {
  it('falls back to the window origin when APP_BASE_URL is unset', async () => {
    // jsdom serves the test document from http://localhost
    expect((await loadRoutes()).appBaseUrl()).toBe('http://localhost');
  });

  it('strips a trailing slash from the configured value', async () => {
    expect((await loadRoutes('https://soil.example.com/')).appBaseUrl()).toBe('https://soil.example.com');
  });

  it('keeps a sub-path prefix', async () => {
    expect((await loadRoutes('https://example.com/app/')).appBaseUrl()).toBe('https://example.com/app');
  });

  it('drops query and fragment from the configured value', async () => {
    expect((await loadRoutes('https://example.com/app?a=1#b')).appBaseUrl()).toBe('https://example.com/app');
  });

  it('warns once at module load and falls back when the configured value is not a URL', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const routes = await loadRoutes('not-a-url');

    routes.appBaseUrl();
    routes.metadataUrl('one');
    routes.metadataUrl('two');

    expect(routes.appBaseUrl()).toBe('http://localhost');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('appUrl', () => {
  it('resolves against the origin', async () => {
    expect((await loadRoutes('https://soil.example.com')).appUrl('/terms-of-use')).toBe('https://soil.example.com/terms-of-use');
  });

  it('preserves a sub-path prefix instead of resetting to the origin', async () => {
    expect((await loadRoutes('https://example.com/app')).appUrl('/terms-of-use')).toBe('https://example.com/app/terms-of-use');
  });
});

describe('metadataUrl', () => {
  it('is absolute against the configured base', async () => {
    expect((await loadRoutes('https://soil.example.com')).metadataUrl('my-dataset')).toBe('https://soil.example.com/datasets/my-dataset');
  });

  it('keeps a sub-path prefix', async () => {
    expect((await loadRoutes('https://example.com/app')).metadataUrl('my-dataset')).toBe('https://example.com/app/datasets/my-dataset');
  });

  it('encodes the id exactly once', async () => {
    expect((await loadRoutes('https://example.com')).metadataUrl('a b')).toBe('https://example.com/datasets/a%20b');
  });
});
