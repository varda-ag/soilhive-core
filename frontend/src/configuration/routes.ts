import { APP_BASE_URL } from '../utilities/environmentVariables';

/**
 * Route pattern for the dataset metadata page. Shared by the router, the SSR
 * route table and the hydration lookup in bootstrap.tsx — those three must
 * match exactly (bootstrap resolves the page component by this literal string),
 * so they read it from here rather than repeating it.
 */
export const METADATA_ROUTE = '/datasets/:id';

export const TERMS_OF_USE_ROUTE = '/terms-of-use';
export const PRIVACY_POLICY_ROUTE = '/privacy-policy';

/** In-app path to a dataset's metadata page, for router links and hrefs. */
export function metadataPath(datasetId: string): string {
  return `/datasets/${encodeURIComponent(datasetId)}`;
}

/**
 * APP_BASE_URL reduced to its origin. Computed once at module load: the value
 * cannot change during the process, so a misconfigured one warns once here
 * instead of on every call. undefined when unset or unparseable.
 */
const configuredBase: string | undefined = (() => {
  if (!APP_BASE_URL) return undefined;
  let url: URL;
  try {
    url = new URL(APP_BASE_URL);
  } catch {
    console.warn('APP_BASE_URL is not a valid absolute URL; falling back to relative app URLs');
    return undefined;
  }
  if (url.pathname !== '/') {
    // The app must be served from the root of its host: the router is built
    // without a basename, the SSR matcher anchors its patterns at '/', and
    // static assets are served from '/'. Honouring a sub-path here would build
    // absolute URLs that the app itself cannot route, so it is dropped rather
    // than propagated into shared links.
    console.warn(`APP_BASE_URL must not contain a path; ignoring "${url.pathname}". Serve the app from the root of its host.`);
  }
  return url.origin;
})();

/**
 * Absolute origin the app is served from, with no trailing slash.
 * APP_BASE_URL is the only source under SSR; in the browser
 * window.location.origin is the fallback, so local dev works with the variable
 * unset. Empty when neither is available, which callers read as "stay
 * relative".
 */
export function appBaseUrl(): string {
  if (configuredBase) return configuredBase;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Absolute URL for an in-app path — for anything that leaves the app: og:url,
 * export payloads, links handed to plugins.
 */
export function appUrl(path: string): string {
  const base = appBaseUrl();
  if (!base) return path;
  return new URL(path, base).href;
}

/** Absolute URL of a dataset's metadata page. */
export function metadataUrl(datasetId: string): string {
  return appUrl(metadataPath(datasetId));
}
