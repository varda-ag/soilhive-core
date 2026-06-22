import { loadGoogleTagManager } from '../../src/utilities/analytics';

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
});
