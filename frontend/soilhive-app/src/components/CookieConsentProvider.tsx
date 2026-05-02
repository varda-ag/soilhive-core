import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

import { CONSENT_CATEGORIES, CONSENT_PARAMS, GA4_SERVICE_NAME } from '../configuration/analytics';
import { COOKIE_DOMAIN, GTM_CONTAINER_ID } from '../utilities/environmentVariables';
import enTranslations from '../../public/locales/en/consent.json';
import itTranslations from '../../public/locales/it/consent.json';
import deTranslations from '../../public/locales/de/consent.json';
import esTranslations from '../../public/locales/es/consent.json';

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

export const CookieConsentProvider = ({ children }: { children: ReactNode }) => {
  const [analyticsAccepted, setAnalyticsAccepted] = useState(false);

  useEffect(() => {
    const isAnalyticsAccepted = (): boolean => CookieConsent.acceptedService(GA4_SERVICE_NAME, CONSENT_CATEGORIES.ANALYTICS);

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
      const accepted = isAnalyticsAccepted();
      setAnalyticsAccepted(accepted);
      updateGA4Consent(accepted);
    };

    // Called on first consent and on preference changes. After the consent
    // update, push a page_view so GTM can send the hit that was blocked when
    // the page initially loaded with denied consent.
    const handleActiveConsentChange = (): void => {
      handleConsentUpdate();
      if (isAnalyticsAccepted() && typeof window.gtag === 'function') {
        window.gtag('event', 'page_view');
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

      onFirstConsent: handleActiveConsentChange,
      onChange: handleActiveConsentChange,
      onConsent: handleActiveConsentChange,
    });
  }, []);

  return (
    <CookieConsentContext.Provider value={{ analyticsAccepted, showPreferences: CookieConsent.showPreferences }}>
      {children}
    </CookieConsentContext.Provider>
  );
};
