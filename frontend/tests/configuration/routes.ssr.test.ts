/**
 * @jest-environment node
 *
 * Server-side behaviour of configuration/routes: there is no window, so
 * APP_BASE_URL (read from process.env) is the only source of an origin, and its
 * absence is what makes absolute URLs degrade to relative paths.
 */
type RoutesModule = typeof import('configuration/routes');

const loadRoutes = async (appBaseUrl?: string): Promise<RoutesModule> => {
  jest.resetModules();
  if (appBaseUrl === undefined) delete process.env['APP_BASE_URL'];
  else process.env['APP_BASE_URL'] = appBaseUrl;
  return import('configuration/routes');
};

afterEach(() => {
  delete process.env['APP_BASE_URL'];
  jest.restoreAllMocks();
});

it('uses APP_BASE_URL when there is no window', async () => {
  expect((await loadRoutes('https://soil.example.com')).metadataUrl('my-dataset')).toBe('https://soil.example.com/datasets/my-dataset');
});

it('drops a sub-path when there is no window', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  expect((await loadRoutes('https://example.com/app')).metadataUrl('my-dataset')).toBe('https://example.com/datasets/my-dataset');
});

describe('with no origin available at all', () => {
  it('reports an empty base', async () => {
    expect((await loadRoutes()).appBaseUrl()).toBe('');
  });

  it('leaves appUrl relative rather than producing a broken absolute URL', async () => {
    expect((await loadRoutes()).appUrl('/terms-of-use')).toBe('/terms-of-use');
  });

  it('leaves metadataUrl relative', async () => {
    expect((await loadRoutes()).metadataUrl('my-dataset')).toBe('/datasets/my-dataset');
  });
});
