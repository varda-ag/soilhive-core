import {
  diffFilterValues,
  isGoogleTagManagerLoaded,
  loadGoogleTagManager,
  trackEvent,
  trackMapFilterChange,
} from '../../src/utilities/analytics';

type WindowWithDataLayer = Window & { dataLayer?: unknown[] };

const GTM_ID = 'GTM-ABC123';

describe('loadGoogleTagManager', () => {
  let placeholderScript: HTMLScriptElement;

  beforeEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    placeholderScript = document.createElement('script');
    placeholderScript.src = 'https://example.com/placeholder.js';
    document.head.appendChild(placeholderScript);
    delete (window as any).dataLayer;
  });

  afterEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    delete (window as any).dataLayer;
  });

  it('injects one new script tag', () => {
    loadGoogleTagManager(GTM_ID);
    expect(document.head.getElementsByTagName('script').length).toBe(2);
  });

  it('sets the injected script src to the GTM URL with the container ID', () => {
    loadGoogleTagManager(GTM_ID);
    const injected = document.head.getElementsByTagName('script')[0];
    expect(injected.src).toBe(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);
  });

  it('marks the injected script as async', () => {
    loadGoogleTagManager(GTM_ID);
    const injected = document.head.getElementsByTagName('script')[0];
    expect(injected.async).toBe(true);
  });

  it('inserts the GTM script before the pre-existing script', () => {
    loadGoogleTagManager(GTM_ID);
    const scripts = document.head.getElementsByTagName('script');
    expect(scripts[0].src).toContain('googletagmanager.com');
    expect(scripts[1]).toBe(placeholderScript);
  });

  it('initialises window.dataLayer as an array when absent', () => {
    loadGoogleTagManager(GTM_ID);
    expect(Array.isArray((window as WindowWithDataLayer).dataLayer)).toBe(true);
  });

  it('pushes the gtm.js start event onto dataLayer', () => {
    loadGoogleTagManager(GTM_ID);
    const entry = ((window as WindowWithDataLayer).dataLayer as Record<string, unknown>[])[0];
    expect(entry.event).toBe('gtm.js');
    expect(typeof entry['gtm.start']).toBe('number');
  });

  it('preserves existing dataLayer entries', () => {
    (window as WindowWithDataLayer).dataLayer = [{ existing: true }];
    loadGoogleTagManager(GTM_ID);
    const layer = (window as WindowWithDataLayer).dataLayer as unknown[];
    expect(layer[0]).toEqual({ existing: true });
    expect(layer.length).toBe(2);
  });

  it('does not load the container a second time', () => {
    loadGoogleTagManager(GTM_ID);
    loadGoogleTagManager(GTM_ID);
    expect(document.head.getElementsByTagName('script').length).toBe(2);
    const gtmStarts = ((window as WindowWithDataLayer).dataLayer as Record<string, unknown>[]).filter(entry => entry.event === 'gtm.js');
    expect(gtmStarts).toHaveLength(1);
  });

  it('tells whether the container was loaded', () => {
    expect(isGoogleTagManagerLoaded()).toBe(false);
    loadGoogleTagManager(GTM_ID);
    expect(isGoogleTagManagerLoaded()).toBe(true);
  });
});

describe('trackEvent', () => {
  const dataLayer = () => (window as WindowWithDataLayer).dataLayer as Record<string, unknown>[];

  beforeEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    document.head.appendChild(document.createElement('script'));
    delete (window as any).dataLayer;
  });

  afterEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    delete (window as any).dataLayer;
  });

  it('pushes nothing before the container is loaded, which is only after the analytics consent', () => {
    trackEvent('location_search', { method: 'shape_draw' });
    expect((window as WindowWithDataLayer).dataLayer).toBeUndefined();
  });

  it('empties the previous parameters, then pushes the event with its own', () => {
    loadGoogleTagManager(GTM_ID);
    trackEvent('location_search', { method: 'shape_draw' });
    expect(dataLayer().slice(-2)).toEqual([{ analytics: null }, { event: 'location_search', analytics: { method: 'shape_draw' } }]);
  });

  it('cuts a text parameter to the 100 characters Google Analytics keeps', () => {
    loadGoogleTagManager(GTM_ID);
    trackEvent('dataset_name_search', { dataset_name_search_text: 'a'.repeat(150), result_count: 3 });
    expect(dataLayer().slice(-1)[0]).toEqual({
      event: 'dataset_name_search',
      analytics: { dataset_name_search_text: 'a'.repeat(100), result_count: 3 },
    });
  });
});

describe('diffFilterValues', () => {
  it('gives the values added and the values removed', () => {
    expect(diffFilterValues(['point', 'raster'], ['raster', 'polygonal'])).toEqual({ added: ['polygonal'], removed: ['point'] });
  });

  it('gives nothing for the same values', () => {
    expect(diffFilterValues(['point'], ['point'])).toEqual({ added: [], removed: [] });
  });
});

describe('trackMapFilterChange', () => {
  beforeEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    document.head.appendChild(document.createElement('script'));
    delete (window as any).dataLayer;
    loadGoogleTagManager(GTM_ID);
  });

  afterEach(() => {
    document.head.querySelectorAll('script').forEach(s => s.remove());
    delete (window as any).dataLayer;
  });

  it('sends one event for each value ticked and each value unticked', () => {
    trackMapFilterChange('data_type', ['point'], ['raster', 'polygonal']);
    const events = ((window as WindowWithDataLayer).dataLayer as Record<string, unknown>[]).filter(entry => entry.event);
    expect(events.slice(1)).toEqual([
      { event: 'map_filter_change', analytics: { filter_name: 'data_type', filter_value: 'raster', filter_action: 'add' } },
      { event: 'map_filter_change', analytics: { filter_name: 'data_type', filter_value: 'polygonal', filter_action: 'add' } },
      { event: 'map_filter_change', analytics: { filter_name: 'data_type', filter_value: 'point', filter_action: 'remove' } },
    ]);
  });
});
