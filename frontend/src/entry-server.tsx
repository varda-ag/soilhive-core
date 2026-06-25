import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import adminTranslations from '../public/locales/en/admin.json';
import commonTranslations from '../public/locales/en/common.json';
import metadataTranslations from '../public/locales/en/metadata.json';
import { NotificationProvider, ThemeProvider } from './contexts';
import MetadataPage from './pages/Metadata';
import { ssrAuthStore } from './auth/ssrAuthStore';
import { SsrAuthContextProvider } from './auth/AuthContextProvider';
import { buildMetadataHeadHtml } from './utilities/buildMetadataHead';
import type { Dataset } from 'types/backend';
import { IngestionStatus } from 'types/backend';

// Initialize i18next synchronously for SSR — no HTTP backend, no browser
// language detector.  Translation files are imported directly so server
// rendering produces real strings rather than raw keys.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: {
        admin: adminTranslations,
        common: commonTranslations,
        metadata: metadataTranslations,
      },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

function isAdminToken(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const roles = (payload.scope ?? '').toLowerCase().split(' ');
    return roles.includes('data-admin') || roles.includes('super-admin');
  } catch {
    return false;
  }
}

/**
 * Map of URL path patterns to their SSR-capable page components.
 * Only pages listed here will be server-side rendered; all other
 * routes fall through to the standard SPA index.html.
 */
const SSR_ROUTES: Record<string, React.ComponentType> = {
  '/datasets/:id': MetadataPage,
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
 * Returns the matched route pattern (e.g. '/datasets/:id') for a given
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
): Promise<{ html: string; dehydratedState: unknown; head: string } | { redirect: string } | null> {
  const pathname = new URL(url, 'http://localhost').pathname;
  const matchedPattern = matchSSRRoute(pathname);
  const PageComponent = matchedPattern ? SSR_ROUTES[matchedPattern] : null;

  if (!PageComponent) return null;

  ssrAuthStore.set(context?.authToken ?? null);

  const queryClient = new QueryClient();

  const backendUrl = process.env.BACKEND_BASE_URL ?? '';

  const buildHeaders = (): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (context?.authToken) headers['Authorization'] = `Bearer ${context.authToken}`;
    return headers;
  };

  // Prefetch route-specific queries so renderToString sees real data.
  const datasetMatch = matchedPattern === '/datasets/:id' ? pathname.match(/^\/datasets\/([^/]+)$/) : null;
  if (datasetMatch) {
    const datasetId = datasetMatch[1];
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['dataset', datasetId],
        queryFn: async () => {
          const res = await fetch(`${backendUrl}/datasets/${datasetId}`, { headers: buildHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['licenses'],
        queryFn: async () => {
          const res = await fetch(`${backendUrl}/licenses`, { headers: buildHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['soilProperties'],
        queryFn: async () => {
          const res = await fetch(`${backendUrl}/soil-properties`, { headers: buildHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      }),
    ]);

    const cachedDataset = queryClient.getQueryData<Dataset>(['dataset', datasetMatch[1]]);
    if (cachedDataset && cachedDataset.status !== IngestionStatus.PUBLISHED && !isAdminToken(context?.authToken ?? null)) {
      ssrAuthStore.set(null);
      return { redirect: '/' };
    }
  }

  // Prefetch theme config so ThemeProvider has data during renderToString.
  // Logo is intentionally excluded — URL.createObjectURL() is browser-only.
  await queryClient.prefetchQuery({
    queryKey: ['/config/theme'],
    queryFn: async () => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (context?.authToken) headers['Authorization'] = `Bearer ${context.authToken}`;
      const res = await fetch(`${backendUrl}/config/theme`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const dehydratedState = dehydrate(queryClient);

  let head = '';
  if (datasetMatch) {
    const datasetId = datasetMatch[1];
    const cachedDataset = queryClient.getQueryData<Dataset>(['dataset', datasetId]);
    if (cachedDataset?.name) {
      head = buildMetadataHeadHtml(cachedDataset.name);
    }
  }

  try {
    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <SsrAuthContextProvider>
            <ThemeProvider>
              <StaticRouter location={pathname}>
                <Routes>
                  <Route path={matchedPattern!} element={<PageComponent />} />
                </Routes>
              </StaticRouter>
            </ThemeProvider>
          </SsrAuthContextProvider>
        </NotificationProvider>
      </QueryClientProvider>,
    );

    return { html, dehydratedState, head };
  } finally {
    ssrAuthStore.set(null);
  }
}
