declare global {
  interface Window {
    _env_: {
      MAPBOX_ACCESS_TOKEN?: string;
      BACKEND_BASE_URL?: string;
    };
  }
}

const MAPBOX_ACCESS_TOKEN: string | undefined = window._env_.MAPBOX_ACCESS_TOKEN;
const BACKEND_BASE_URL: string | undefined = window._env_.BACKEND_BASE_URL;

export { MAPBOX_ACCESS_TOKEN, BACKEND_BASE_URL };
