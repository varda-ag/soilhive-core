import React, { Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider, HydrationBoundary } from '@tanstack/react-query';
import App from './App';

import './styles/index.scss';
import { CONSENT_PARAMS } from './configuration/analytics';
import { GTM_CONTAINER_ID } from './utilities/environmentVariables';
import { NotificationProvider, ThemeProvider } from './contexts';
import { SsrAuthContextProvider } from './auth/AuthContextProvider';
import { loadGoogleTagManager } from 'utilities/analytics';

// SSR page components — loaded lazily so they are not bundled into every page.
// The key must exactly match the `data-ssr-page` attribute injected by the server.
const SSR_COMPONENTS: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/datasets/:id': () => import('./pages/Metadata'),
};

if (GTM_CONTAINER_ID) {
  // Initialize dataLayer + gtag
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag;

  // Default-denied BEFORE any script loads
  window.gtag('consent', 'default', {
    [CONSENT_PARAMS.ANALYTICS_STORAGE]: 'denied',
    [CONSENT_PARAMS.AD_STORAGE]: 'denied',
    [CONSENT_PARAMS.AD_USER_DATA]: 'denied',
    [CONSENT_PARAMS.AD_PERSONALIZATION]: 'denied',
    [CONSENT_PARAMS.FUNCTIONALITY_STORAGE]: 'denied',
    [CONSENT_PARAMS.PERSONALIZATION_STORAGE]: 'denied',
    wait_for_update: 500,
  });

  // Inject GTM script dynamically
  loadGoogleTagManager(GTM_CONTAINER_ID);
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const ssrPage = rootEl.getAttribute('data-ssr-page');

  if (ssrPage && SSR_COMPONENTS[ssrPage]) {
    // Hydration mode: the server rendered this page — reuse the exact same
    // provider tree so React can reconcile against the existing DOM nodes.
    SSR_COMPONENTS[ssrPage]().then(({ default: PageComponent }) => {
      const queryClient = new QueryClient();
      const queryState = (window as any).__REACT_QUERY_STATE__;
      hydrateRoot(
        rootEl,
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={queryState}>
            <NotificationProvider>
              <SsrAuthContextProvider>
                <ThemeProvider>
                  <BrowserRouter>
                    <Routes>
                      <Route path={ssrPage} element={<PageComponent />} />
                    </Routes>
                  </BrowserRouter>
                </ThemeProvider>
              </SsrAuthContextProvider>
            </NotificationProvider>
          </HydrationBoundary>
        </QueryClientProvider>,
      );
    });
  } else {
    // Standard SPA mode: full application shell
    const root = createRoot(rootEl);
    root.render(
      <Suspense fallback="">
        <React.StrictMode>
          <App />
        </React.StrictMode>
      </Suspense>,
    );
  }
}
