import React, { Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

import './styles/index.scss';
import { CONSENT_PARAMS } from './configuration/analytics';
import { GTM_CONTAINER_ID } from './utilities/environmentVariables';
import { NotificationProvider } from './contexts';

// SSR page components — loaded lazily so they are not bundled into every page.
// The key must exactly match the `data-ssr-page` attribute injected by the server.
const SSR_COMPONENTS: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/metadata': () => import('./pages/Metadata'),
};

if (GTM_CONTAINER_ID) {
  // Initialize dataLayer + gtag
  window.dataLayer = window.dataLayer || [];
  // Must use `arguments` (not rest params) so GTM recognises this as a gtag command.
  // GTM checks Object.prototype.toString.call(item) === "[object Arguments]"; a plain
  // Array pushed via rest params is silently ignored by consent mode processing.
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  } as typeof window.gtag;

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
  const gtmScript = document.createElement('script');
  gtmScript.async = true;
  gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  document.head.appendChild(gtmScript);
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const ssrPage = rootEl.getAttribute('data-ssr-page');

  if (ssrPage && SSR_COMPONENTS[ssrPage]) {
    // Hydration mode: the server rendered this page — reuse the exact same
    // provider tree so React can reconcile against the existing DOM nodes.
    SSR_COMPONENTS[ssrPage]().then(({ default: PageComponent }) => {
      const queryClient = new QueryClient();
      hydrateRoot(
        rootEl,
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <BrowserRouter>
              <Suspense fallback="">
                <PageComponent />
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
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
