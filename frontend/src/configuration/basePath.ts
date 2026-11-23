import { APP_BASE_PATH } from '../utilities/environmentVariables';

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * APP_BASE_PATH as '' (domain root) or '/a/b': 'app', '/app' and '/app/' all
 * give '/app'. undefined when unusable; the server refuses to start on that (ADR 0084).
 */
export function normaliseBasePath(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? '').replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  const segments = trimmed.split('/');
  if (segments.some(segment => !SEGMENT.test(segment) || segment === '.' || segment === '..')) return undefined;
  return `/${segments.join('/')}`;
}

/** Path the app is served under: '' at the domain root, else e.g. '/app'. */
export const BASE_PATH: string = normaliseBasePath(APP_BASE_PATH) ?? '';

/** The router's basename. */
export const ROUTER_BASENAME: string = BASE_PATH || '/';

/** An in-app path ('/datasets/x') as the browser sees it ('/app/datasets/x'). */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
