import React, { Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider, HydrationBoundary } from '@tanstack/react-query';
import App from './App';

import './styles/index.scss';
import { NotificationProvider, ThemeProvider } from './contexts';
import { SsrAuthContextProvider } from './auth/AuthContextProvider';
import { CookieConsentProvider } from './components/CookieConsentProvider';

// SSR page components — loaded lazily so they are not bundled into every page.
// The key must exactly match the `data-ssr-page` attribute injected by the server.
const SSR_COMPONENTS: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/datasets/:id': () => import('./pages/Metadata'),
};

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
              <CookieConsentProvider>
                <SsrAuthContextProvider>
                  <ThemeProvider>
                    <BrowserRouter>
                      <Routes>
                        <Route path={ssrPage} element={<PageComponent />} />
                      </Routes>
                    </BrowserRouter>
                  </ThemeProvider>
                </SsrAuthContextProvider>
              </CookieConsentProvider>
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
