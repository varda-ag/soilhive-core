import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import adminTranslations from '../public/locales/en/admin.json';
import commonTranslations from '../public/locales/en/common.json';
import { NotificationProvider } from './contexts';
import MetadataPage from './pages/Metadata';
import { ssrAuthStore } from './auth/ssrAuthStore';

// Initialize i18next synchronously for SSR — no HTTP backend, no browser
// language detector.  Translation files are imported directly so server
// rendering produces real strings rather than raw keys.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: {
        admin: adminTranslations,
        common: commonTranslations,
      },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

/**
 * Map of URL path patterns to their SSR-capable page components.
 * Only pages listed here will be server-side rendered; all other
 * routes fall through to the standard SPA index.html.
 */
const SSR_ROUTES: Record<string, React.ComponentType> = {
  '/metadata/:id': MetadataPage,
};

/**
 * The list of URL path patterns that have SSR-capable components.
 * Exported so server/index.ts can decide whether to resolve auth
 * before calling render() — without duplicating the route list.
 */
export const SSR_ROUTE_PATHS: string[] = Object.keys(SSR_ROUTES);

function pathMatchesPattern(pattern: string, pathname: string): boolean {
  const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
  return re.test(pathname);
}

/**
 * Returns the matched route pattern (e.g. '/metadata/:id') for a given
 * pathname, or null if no SSR route matches.
 */
export function matchSSRRoute(pathname: string): string | null {
  return SSR_ROUTE_PATHS.find(p => pathMatchesPattern(p, pathname)) ?? null;
}

/**
 * Render a URL to an HTML string.
 *
 * Called by the Express server for each incoming request whose path
 * matches one of the SSR_ROUTES above.
 *
 * `context.authToken` — when provided by the server (read from the auth header),
 * it is placed into ssrAuthStore so that any httpClient calls made
 * during renderToString can attach a Bearer token to backend requests.
 *
 * Returns null when no matching SSR component is registered so the
 * server can fall back to serving the SPA shell instead.
 */
export async function render(
  url: string,
  context?: { authToken?: string | null },
): Promise<{ html: string; dehydratedState: unknown } | null> {
  const pathname = new URL(url, 'http://localhost').pathname;
  const matchedPattern = matchSSRRoute(pathname);
  const PageComponent = matchedPattern ? SSR_ROUTES[matchedPattern] : null;

  if (!PageComponent) return null;

  ssrAuthStore.set(context?.authToken ?? null);

  const queryClient = new QueryClient();

  // Prefetch route-specific queries so renderToString sees real data.
  const datasetMatch = matchedPattern === '/metadata/:id' ? pathname.match(/^\/metadata\/([^/]+)$/) : null;
  if (datasetMatch) {
    const datasetId = datasetMatch[1];
    const backendUrl = process.env.BACKEND_BASE_URL ?? '';
    await queryClient.prefetchQuery({
      queryKey: ['dataset', datasetId],
      queryFn: async () => {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (context?.authToken) headers['Authorization'] = `Bearer ${context.authToken}`;
        const res = await fetch(`${backendUrl}/datasets/${datasetId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
    });
  }

  const dehydratedState = dehydrate(queryClient);

  try {
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <StaticRouter location={pathname}>
            <Routes>
              <Route path={matchedPattern!} element={<PageComponent />} />
            </Routes>
          </StaticRouter>
        </NotificationProvider>
      </QueryClientProvider>,
    );

    return { html, dehydratedState };
  } finally {
    ssrAuthStore.set(null);
  }
}
