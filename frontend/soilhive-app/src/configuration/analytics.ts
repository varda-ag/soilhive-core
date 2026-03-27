// vanilla-cookieconsent cookie name
export const CONSENT_COOKIE_NAME = 'cc_cookie';

// Consent Mode v2 parameters
export const CONSENT_PARAMS = {
  ANALYTICS_STORAGE: 'analytics_storage',
  AD_STORAGE: 'ad_storage',
  AD_USER_DATA: 'ad_user_data',
  AD_PERSONALIZATION: 'ad_personalization',
  FUNCTIONALITY_STORAGE: 'functionality_storage',
  PERSONALIZATION_STORAGE: 'personalization_storage',
} as const;

// Categories used in vanilla-cookieconsent config
export const CONSENT_CATEGORIES = {
  NECESSARY: 'necessary',
  ANALYTICS: 'analytics',
} as const;

// Service name under the analytics category
export const GA4_SERVICE_NAME = 'Google Analytics 4';
