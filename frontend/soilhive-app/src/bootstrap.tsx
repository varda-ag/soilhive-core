import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/index.scss';
import { CONSENT_PARAMS } from './configuration/analytics';
import { GTM_CONTAINER_ID } from './utilities/environmentVariables';

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
  const gtmScript = document.createElement('script');
  gtmScript.async = true;
  gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  document.head.appendChild(gtmScript);
}

// Mount React app
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <Suspense fallback="">
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </Suspense>,
  );
}
