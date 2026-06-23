import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

import { CONSENT_CATEGORIES, CONSENT_PARAMS, GA4_SERVICE_NAME } from '../configuration/analytics';
import { COOKIE_DOMAIN, GTM_CONTAINER_ID } from '../utilities/environmentVariables';
import enTranslations from '../../public/locales/en/consent.json';
import itTranslations from '../../public/locales/it/consent.json';
import deTranslations from '../../public/locales/de/consent.json';
import esTranslations from '../../public/locales/es/consent.json';
import { loadGoogleTagManager } from 'utilities/analytics';

interface CookieConsentContextType {
  analyticsAccepted: boolean;
  showPreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

export const useCookieConsent = (): CookieConsentContextType => {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error('useCookieConsent must be used inside CookieConsentProvider');
  return ctx;
};

const updateGA4Consent = (analyticsGranted: boolean): void => {
  if (typeof window.gtag !== 'function') return;

  window.gtag('consent', 'update', {
    [CONSENT_PARAMS.ANALYTICS_STORAGE]: analyticsGranted ? 'granted' : 'denied',
    [CONSENT_PARAMS.AD_STORAGE]: analyticsGranted ? 'granted' : 'denied',
    [CONSENT_PARAMS.AD_USER_DATA]: analyticsGranted ? 'granted' : 'denied',
    [CONSENT_PARAMS.AD_PERSONALIZATION]: analyticsGranted ? 'granted' : 'denied',
    [CONSENT_PARAMS.FUNCTIONALITY_STORAGE]: 'granted', // always allow functional cookies
    [CONSENT_PARAMS.PERSONALIZATION_STORAGE]: analyticsGranted ? 'granted' : 'denied',
  });
};

function injectGoogleAnalytics() {
  const dataLayer = window.dataLayer || [];
  const gtag = (...args: any) => dataLayer.push(args);

  // Default-denied BEFORE any script loads
  gtag('consent', 'default', {
    [CONSENT_PARAMS.ANALYTICS_STORAGE]: 'denied',
    [CONSENT_PARAMS.AD_STORAGE]: 'denied',
    [CONSENT_PARAMS.AD_USER_DATA]: 'denied',
    [CONSENT_PARAMS.AD_PERSONALIZATION]: 'denied',
    [CONSENT_PARAMS.FUNCTIONALITY_STORAGE]: 'denied',
    [CONSENT_PARAMS.PERSONALIZATION_STORAGE]: 'denied',
    wait_for_update: 500,
  });

  if (GTM_CONTAINER_ID) {
    // Inject GTM script dynamically
    loadGoogleTagManager(GTM_CONTAINER_ID);
  }
}

export const CookieConsentProvider = ({ children }: { children: ReactNode }) => {
  const [analyticsAccepted, setAnalyticsAccepted] = useState(false);

  useEffect(() => {
    const categories = {
      [CONSENT_CATEGORIES.NECESSARY]: {
        enabled: true,
        readOnly: true,
      },
      ...(GTM_CONTAINER_ID && {
        [CONSENT_CATEGORIES.ANALYTICS]: {
          services: {
            [GA4_SERVICE_NAME]: {
              label: 'Google Analytics 4',
              onAccept: () => updateGA4Consent(true),
              onReject: () => updateGA4Consent(false),
            },
          },
        },
      }),
    };

    const handleConsentUpdate = (): void => {
      const isAnalyticsAccepted = CookieConsent.acceptedService(GA4_SERVICE_NAME, CONSENT_CATEGORIES.ANALYTICS);
      setAnalyticsAccepted(isAnalyticsAccepted);
      updateGA4Consent(isAnalyticsAccepted);
      if (isAnalyticsAccepted) {
        injectGoogleAnalytics();
      } else if ((window as any).gtag) {
        window.location.reload();
      }
    };

    CookieConsent.run({
      cookie: {
        name: 'cc_cookie',
        domain: COOKIE_DOMAIN,
        expiresAfterDays: 365,
        sameSite: 'Strict',
      },

      guiOptions: {
        consentModal: {
          layout: 'box inline',
          position: 'bottom center',
          equalWeightButtons: false,
          flipButtons: true,
        },
        preferencesModal: {
          layout: 'box',
        },
      },
      categories,
      language: {
        default: 'en',
        autoDetect: 'browser',
        translations: {
          en: enTranslations,
          it: itTranslations,
          es: esTranslations,
          de: deTranslations,
        },
      },
      onConsent: handleConsentUpdate,
      onChange: handleConsentUpdate,
    });

    // Re-apply stored consent on page reload
    handleConsentUpdate();
  }, []);

  return (
    <CookieConsentContext.Provider value={{ analyticsAccepted, showPreferences: CookieConsent.showPreferences }}>
      {children}
    </CookieConsentContext.Provider>
  );
};
