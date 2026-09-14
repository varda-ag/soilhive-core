import { APP_BASE_URL } from '../utilities/environmentVariables';

/**
 * Route pattern for the dataset metadata page. Shared by the router, the SSR
 * route table and the hydration lookup in bootstrap.tsx — those three must
 * match exactly (bootstrap resolves the page component by this literal string),
 * so they read it from here rather than repeating it.
 */
export const METADATA_ROUTE = '/datasets/:id';

export const TERMS_OF_USE_ROUTE = '/terms-of-use';

/** In-app path to a dataset's metadata page, for router links and hrefs. */
export function metadataPath(datasetId: string): string {
  return `/datasets/${encodeURIComponent(datasetId)}`;
}

/**
 * APP_BASE_URL reduced to origin + sub-path prefix with no trailing slash.
 * Computed once at module load: the value cannot change during the process, so
 * a misconfigured one warns once here instead of on every call. undefined when
 * unset or unparseable.
 */
const configuredBase: string | undefined = (() => {
  if (!APP_BASE_URL) return undefined;
  try {
    const { origin, pathname } = new URL(APP_BASE_URL);
    return `${origin}${pathname}`.replace(/\/+$/, '');
  } catch {
    console.warn('APP_BASE_URL is not a valid absolute URL; falling back to relative app URLs');
    return undefined;
  }
})();

/**
 * Absolute base the app is served from: origin plus any sub-path prefix, no
 * trailing slash. APP_BASE_URL is the only source under SSR; in the browser
 * window.location.origin is the fallback — it carries no sub-path, so a
 * deployment served under one must set APP_BASE_URL for absolute links to be
 * correct. Empty when neither is available, which callers read as "stay
 * relative".
 */
export function appBaseUrl(): string {
  if (configuredBase) return configuredBase;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Absolute URL for an in-app path — for anything that leaves the app: og:url,
 * export payloads, links handed to plugins. Resolved relative to the base so a
 * sub-path prefix survives; a leading slash would reset it to the bare origin.
 */
export function appUrl(path: string): string {
  const base = appBaseUrl();
  if (!base) return path;
  return new URL(path.replace(/^\/+/, ''), `${base}/`).href;
}

/** Absolute URL of a dataset's metadata page. */
export function metadataUrl(datasetId: string): string {
  return appUrl(metadataPath(datasetId));
}
