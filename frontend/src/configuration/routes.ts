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
 * Absolute origin the app is served from. APP_BASE_URL is the only source
 * available under SSR; window.location is the browser fallback so local dev
 * works with the variable unset. Normalised through URL.origin so a configured
 * value with a trailing slash or path still yields a bare origin. Empty when
 * neither source is available, which callers read as "stay relative".
 */
export function appOrigin(): string {
  if (APP_BASE_URL) {
    try {
      return new URL(APP_BASE_URL).origin;
    } catch {
      console.warn('APP_BASE_URL is not a valid absolute URL; falling back to relative app URLs');
    }
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Absolute URL for an in-app path — for anything that leaves the app: og:url,
 * export payloads, links handed to plugins.
 */
export function appUrl(path: string): string {
  const origin = appOrigin();
  return origin ? new URL(path, origin).href : path;
}

/** Absolute URL of a dataset's metadata page. */
export function metadataUrl(datasetId: string): string {
  return appUrl(metadataPath(datasetId));
}
