import { ANALYTICS_EVENTS, CONSENT_PARAMS, type AnalyticsEventName } from '../configuration/analytics';

const GTM_SCRIPT_URL = 'https://www.googletagmanager.com/gtm.js';

type ConsentState = Partial<Record<(typeof CONSENT_PARAMS)[keyof typeof CONSENT_PARAMS], 'granted' | 'denied'>>;

// Consent Mode v2 state before the visitor's choice. The app only asks for analytics cookies, so the
// ad signals stay denied whatever the visitor chooses.
const DEFAULT_CONSENT: ConsentState = {
  [CONSENT_PARAMS.ANALYTICS_STORAGE]: 'denied',
  [CONSENT_PARAMS.AD_STORAGE]: 'denied',
  [CONSENT_PARAMS.AD_USER_DATA]: 'denied',
  [CONSENT_PARAMS.AD_PERSONALIZATION]: 'denied',
};

// GA4 drops the rest of a longer parameter value
const MAX_PARAM_LENGTH = 100;

/**
 * Injects the Google Tag Manager script into the page using Google's
 * recommended IIFE pattern. Initialises `window.dataLayer` if not already
 * present, then inserts an async `<script>` tag before the first existing
 * script element on the page.
 *
 * Does nothing when the container is already on the page: a second copy would
 * push `gtm.js` again and fire the page view tags twice.
 *
 * @param gtmContainerId - GTM container ID, e.g. `"GTM-XXXXXXX"`
 */
const loadGoogleTagManager = (gtmContainerId: string): void => {
  if (document.querySelector(`script[src="${GTM_SCRIPT_URL}?id=${gtmContainerId}"]`)) return;

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
    j.src = GTM_SCRIPT_URL + '?id=' + i + dl;
    f.parentNode!.insertBefore(j, f);
  })(window, document, 'script', 'dataLayer', gtmContainerId);
};

/**
 * Whether Google Tag Manager was put on the page. It only is once the visitor accepted analytics
 * cookies, and a visitor who withdraws that consent gets the page reloaded without it.
 */
const isGoogleTagManagerLoaded = (): boolean =>
  typeof document !== 'undefined' && document.querySelector(`script[src^="${GTM_SCRIPT_URL}?id="]`) !== null;

/**
 * Google's `gtag` function, as in Google's own snippet: it queues a command on the dataLayer, which
 * GTM runs in order once loaded. GTM only reads a command from an `arguments` object, not from an
 * array.
 */
function gtag(..._command: ['consent', 'default' | 'update', ConsentState]): void {
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

/** Tells GTM's Google tags, through Consent Mode v2, whether they may store and send analytics data */
const updateAnalyticsConsent = (granted: boolean): void =>
  gtag('consent', 'update', { [CONSENT_PARAMS.ANALYTICS_STORAGE]: granted ? 'granted' : 'denied' });

// GA4's cookies: `_ga` and `_ga_<stream>`
const GA_COOKIE_NAME = /^_ga/;

/**
 * Deletes GA4's cookies, for a visitor who withdrew the consent. GA4 sets them on the widest domain
 * it can (its `cookie_domain` is `auto`), usually a parent of the app's host, so they are deleted
 * as host-only cookies and on the host and each of its parent domains.
 */
const clearAnalyticsCookies = (): void => {
  const labels = window.location.hostname.split('.');
  // core.dev.example.org → core.dev.example.org, dev.example.org, example.org: a top-level domain holds no cookie
  const domains = [undefined, ...labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'))];

  document.cookie
    .split(';')
    .map(cookie => cookie.split('=')[0].trim())
    .filter(name => GA_COOKIE_NAME.test(name))
    .forEach(name =>
      domains.forEach(domain => {
        document.cookie = `${name}=; path=/; max-age=0${domain ? `; domain=${domain}` : ''}`;
      }),
    );
};

/**
 * Puts GTM on the page for a visitor who accepted analytics cookies. The Consent Mode default (all
 * denied) and the update granting analytics go on the dataLayer before `gtm.js`, so the first tags
 * already run with the visitor's choice. Does nothing when GTM is already on the page.
 *
 * @param gtmContainerId - GTM container ID, e.g. `"GTM-XXXXXXX"`
 */
const startGoogleTagManager = (gtmContainerId: string): void => {
  if (isGoogleTagManagerLoaded()) return;

  gtag('consent', 'default', DEFAULT_CONSENT);
  updateAnalyticsConsent(true);
  loadGoogleTagManager(gtmContainerId);
};

export type AnalyticsParams = Record<string, string | number | undefined>;

/**
 * Pushes a usage event onto the GTM dataLayer, for the GTM container to send on to Google Analytics.
 * Does nothing until the visitor accepted analytics cookies (see docs/frontend/analytics.md), so
 * nothing done before the consent is sent after it.
 *
 * The parameters go under `analytics`, which is emptied first: GTM keeps every key it was given, and
 * a parameter of an earlier event would otherwise be sent again with a later one.
 */
const trackEvent = (name: AnalyticsEventName, params: AnalyticsParams = {}): void => {
  if (typeof window === 'undefined' || !isGoogleTagManagerLoaded()) return;

  const analytics = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, MAX_PARAM_LENGTH) : value]),
  );
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ analytics: null });
  window.dataLayer.push({ event: name, analytics });
};

/** The values in `next` that were not in `previous`, and the other way round */
const diffFilterValues = <T>(previous: readonly T[], next: readonly T[]): { added: T[]; removed: T[] } => ({
  added: next.filter(value => !previous.includes(value)),
  removed: previous.filter(value => !next.includes(value)),
});

/** One map_filter_change event for each value the visitor ticked or unticked in one of the map's filters */
const trackMapFilterChange = (filterName: string, previous: readonly string[], next: readonly string[]): void => {
  const { added, removed } = diffFilterValues(previous, next);
  added.forEach(value =>
    trackEvent(ANALYTICS_EVENTS.MAP_FILTER_CHANGE, { filter_name: filterName, filter_value: value, filter_action: 'add' }),
  );
  removed.forEach(value =>
    trackEvent(ANALYTICS_EVENTS.MAP_FILTER_CHANGE, { filter_name: filterName, filter_value: value, filter_action: 'remove' }),
  );
};

export {
  loadGoogleTagManager,
  isGoogleTagManagerLoaded,
  updateAnalyticsConsent,
  clearAnalyticsCookies,
  startGoogleTagManager,
  trackEvent,
  diffFilterValues,
  trackMapFilterChange,
};
