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

// Usage events the app pushes onto the GTM dataLayer (docs/frontend/analytics.md). The names follow
// the ones the earlier SoilHive platform sent, where the action is the same.
export const ANALYTICS_EVENTS = {
  LOCATION_SEARCH: 'location_search',
  MAP_FILTER_CHANGE: 'map_filter_change',
  DOWNLOAD_DATA_REQUEST: 'download_data_request',
  DATASET_NAME_SEARCH: 'dataset_name_search',
  EXPLORE_FILTER_CHANGE: 'explore_filter_change',
  EXPLORE_PAGINATION: 'explore_pagination',
  DOWNLOAD_FORMAT_SELECT: 'download_format_select',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// Values of the data-analytics attribute: the GTM container sends a click on such an element as the
// Google Analytics event of that name, with data-analytics-value (or a checkbox's on/off) as click_value
export const ANALYTICS_CLICKS = {
  DAI_TOGGLE: 'dai_toggle',
  MAP_STYLE_BUTTON: 'click_on_map_style_button',
  MAP_STYLE_CHANGE: 'map_style_change',
  EXPLORE_BUTTON: 'click_on_explore_button',
  DOWNLOAD_BUTTON: 'click_on_download_button',
} as const;
