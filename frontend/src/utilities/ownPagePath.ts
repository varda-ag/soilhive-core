// Any origin works: only the path, query and hash of the result are used.
const BASE_ORIGIN = 'http://host.invalid';

/**
 * The app path for subPath, resolved relative to the plugin route (e.g. 'dashboards', as in
 * Routes.tsx). Returns undefined when it resolves outside that route, e.g. '../admin'.
 */
export function resolveOwnPagePath(rawRoute: string, subPath = ''): string | undefined {
  // A leading slash would make '//route/' read as a host name; a trailing one, '/route//sub'.
  const route = rawRoute.replace(/^\/+|\/+$/g, '');
  const base = new URL(`/${route}/`, BASE_ORIGIN);
  const target = new URL(subPath, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    return undefined;
  }
  const pathname = target.pathname === base.pathname ? `/${route}` : target.pathname;
  return `${pathname}${target.search}${target.hash}`;
}
