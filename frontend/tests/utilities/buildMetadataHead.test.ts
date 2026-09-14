/**
 * Exercises the real metadataUrl — Metadata.test.tsx mocks this module, so this
 * is where the og:url a dataset page actually ships with is covered.
 */
type HeadModule = typeof import('utilities/buildMetadataHead');

const loadHead = async (appBaseUrl?: string): Promise<HeadModule> => {
  jest.resetModules();
  (window as unknown as { _env_?: Record<string, string> })._env_ = appBaseUrl === undefined ? {} : { APP_BASE_URL: appBaseUrl };
  return import('utilities/buildMetadataHead');
};

afterEach(() => {
  delete (window as unknown as { _env_?: Record<string, string> })._env_;
});

describe('getMetadataHeadValues', () => {
  it('points url at the dataset, not at a fixed site URL', async () => {
    const { getMetadataHeadValues } = await loadHead('https://soil.example.com');

    expect(getMetadataHeadValues('Soil Grids', 'soil-grids').url).toBe('https://soil.example.com/datasets/soil-grids');
  });

  it('gives two datasets distinct urls', async () => {
    const { getMetadataHeadValues } = await loadHead('https://soil.example.com');

    expect(getMetadataHeadValues('One', 'one').url).not.toBe(getMetadataHeadValues('Two', 'two').url);
  });
});

describe('buildMetadataHeadHtml', () => {
  it('emits the dataset url as og:url', async () => {
    const { buildMetadataHeadHtml } = await loadHead('https://soil.example.com');

    expect(buildMetadataHeadHtml('Soil Grids', 'soil-grids')).toContain(
      '<meta property="og:url" content="https://soil.example.com/datasets/soil-grids" />',
    );
  });

  it('emits no image tags', async () => {
    const html = (await loadHead('https://soil.example.com')).buildMetadataHeadHtml('Soil Grids', 'soil-grids');

    expect(html).not.toContain('og:image');
    expect(html).not.toContain('twitter:image');
  });

  it('escapes a dataset name that would otherwise break out of the attribute', async () => {
    const html = (await loadHead('https://soil.example.com')).buildMetadataHeadHtml('A "quoted" <name>', 'ds');

    expect(html).toContain('&quot;quoted&quot;');
    expect(html).not.toContain('<name>');
  });
});
