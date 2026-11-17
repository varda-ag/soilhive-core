import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

import { CONSENT_CATEGORIES, GA4_SERVICE_NAME } from '../configuration/analytics';
import { COOKIE_DOMAIN, GTM_CONTAINER_ID } from '../utilities/environmentVariables';
import enTranslations from '../../public/locales/en/consent.json';
import itTranslations from '../../public/locales/it/consent.json';
import deTranslations from '../../public/locales/de/consent.json';
import esTranslations from '../../public/locales/es/consent.json';
import { isGoogleTagManagerLoaded, startGoogleTagManager, updateAnalyticsConsent } from 'utilities/analytics';

interface CookieConsentContextType {
  analyticsAccepted: boolean;
  // Whether the banner offers cookies beyond the necessary ones, so the visitor has a choice to change later
  hasOptionalCookies: boolean;
  showPreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

export const useCookieConsent = (): CookieConsentContextType => {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error('useCookieConsent must be used inside CookieConsentProvider');
  return ctx;
};

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
            },
          },
        },
      }),
    };

    // Runs on every consent the library reports: the stored one on each page load, a first choice, a change
    const handleConsentUpdate = (): void => {
      const isAnalyticsAccepted = CookieConsent.acceptedService(GA4_SERVICE_NAME, CONSENT_CATEGORIES.ANALYTICS);
      setAnalyticsAccepted(isAnalyticsAccepted);
      if (isAnalyticsAccepted && GTM_CONTAINER_ID) {
        startGoogleTagManager(GTM_CONTAINER_ID);
      } else if (!isAnalyticsAccepted && isGoogleTagManagerLoaded()) {
        // GTM cannot be taken off the page: its Google tags stop storing at once, and reloading
        // without GTM stops the tracking
        updateAnalyticsConsent(false);
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
    <CookieConsentContext.Provider
      value={{ analyticsAccepted, hasOptionalCookies: !!GTM_CONTAINER_ID, showPreferences: CookieConsent.showPreferences }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
};
