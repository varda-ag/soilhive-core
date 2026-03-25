export const ADMIN_ROOT = '/admin';

export const ADMIN_ROUTES = {
  TERMS_AND_CONDITIONS: 'terms-and-conditions',
  MAP: 'map',
  LOOK_AND_FEEL: 'look-and-feel',
  DATASETS: 'datasets',
  FILTERS: 'filters',
};

export const LOOK_AND_FEEL_ROUTES = {
  LOGO: 'logo',
  COLORS: 'colors',
};

export const ADMIN_PATHS = {
  TERMS_AND_CONDITIONS: `${ADMIN_ROOT}/${ADMIN_ROUTES.TERMS_AND_CONDITIONS}`,
  MAP: `${ADMIN_ROOT}/${ADMIN_ROUTES.MAP}`,
  LOOK_AND_FEEL: `${ADMIN_ROOT}/${ADMIN_ROUTES.LOOK_AND_FEEL}`,
  LOOK_AND_FEEL_LOGO: `${ADMIN_ROOT}/${ADMIN_ROUTES.LOOK_AND_FEEL}/${LOOK_AND_FEEL_ROUTES.LOGO}`,
  LOOK_AND_FEEL_COLORS: `${ADMIN_ROOT}/${ADMIN_ROUTES.LOOK_AND_FEEL}/${LOOK_AND_FEEL_ROUTES.COLORS}`,
  DATASETS: `${ADMIN_ROOT}/${ADMIN_ROUTES.DATASETS}`,
  FILTERS: `${ADMIN_ROOT}/${ADMIN_ROUTES.FILTERS}`,
};

export const PAGE_TITLE_KEYS = {
  [ADMIN_PATHS.TERMS_AND_CONDITIONS]: 'terms_and_conditions.title',
  [ADMIN_PATHS.MAP]: 'map_settings.title',
  [ADMIN_PATHS.LOOK_AND_FEEL]: 'look_and_feel.title',
  [ADMIN_PATHS.LOOK_AND_FEEL_LOGO]: 'look_and_feel.title',
  [ADMIN_PATHS.LOOK_AND_FEEL_COLORS]: 'look_and_feel.title',
  [ADMIN_PATHS.DATASETS]: 'datasets.title',
  [ADMIN_PATHS.FILTERS]: 'filters.title',
};
