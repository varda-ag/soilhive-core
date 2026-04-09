declare global {
  interface Window {
    _env_: {
      MAPBOX_ACCESS_TOKEN?: string;
      BACKEND_BASE_URL?: string;
      GTM_CONTAINER_ID?: string;
      COOKIE_DOMAIN?: string;
    };
  }
}

export const MAPBOX_ACCESS_TOKEN: string | undefined = window._env_.MAPBOX_ACCESS_TOKEN;
export const BACKEND_BASE_URL: string | undefined = window._env_.BACKEND_BASE_URL;
export const GTM_CONTAINER_ID: string | undefined = window._env_.GTM_CONTAINER_ID;
export const COOKIE_DOMAIN: string | undefined = window._env_.COOKIE_DOMAIN;
