declare global {
  interface Window {
    _env_: {
      MAPBOX_ACCESS_TOKEN?: string;
      BACKEND_BASE_URL?: string;
      GTM_CONTAINER_ID?: string;
      COOKIE_DOMAIN?: string;
      FEATURE_FLAGS?: string;
    };
  }
}

// Support both browser (window._env_) and Node.js (process.env) environments for SSR
const _env: Record<string, string | undefined> =
  typeof window !== 'undefined' ? (window._env_ ?? {}) : (process.env as Record<string, string | undefined>);

export const MAPBOX_ACCESS_TOKEN: string | undefined = _env.MAPBOX_ACCESS_TOKEN;
export const BACKEND_BASE_URL: string | undefined = _env.BACKEND_BASE_URL;
export const GTM_CONTAINER_ID: string | undefined = _env.GTM_CONTAINER_ID;
export const COOKIE_DOMAIN: string | undefined = _env.COOKIE_DOMAIN;
export const FEATURE_FLAGS: string | undefined = _env.FEATURE_FLAGS;
