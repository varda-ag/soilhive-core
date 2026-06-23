/**
 * Injects the Google Tag Manager script into the page using Google's
 * recommended IIFE pattern. Initialises `window.dataLayer` if not already
 * present, then inserts an async `<script>` tag before the first existing
 * script element on the page.
 *
 * @param gtmContainerId - GTM container ID, e.g. `"GTM-XXXXXXX"`
 */
const loadGoogleTagManager = (gtmContainerId: string): void => {
  (function (w: Window & typeof globalThis, d: Document, s: 'script', l: string, i: string) {
    (w as unknown as Record<string, unknown[]>)[l] = (w as unknown as Record<string, unknown[]>)[l] || [];
    (w as unknown as Record<string, unknown[]>)[l].push({
      'gtm.start': new Date().getTime(),
      event: 'gtm.js',
    });
    const f = d.getElementsByTagName(s)[0],
      j = d.createElement(s),
      dl = l != 'dataLayer' ? '&l=' + l : '';
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.parentNode!.insertBefore(j, f);
  })(window, document, 'script', 'dataLayer', gtmContainerId);
};

export { loadGoogleTagManager };
