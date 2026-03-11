import { BACKEND_BASE_URL } from '../utilities/environmentVariables';

export { BACKEND_BASE_URL };

export const QUERY_STALE_TIME = 600000; // Caching the responses for 10 minutes (use @tanstack/react-query-devtools for useQuery debugging)

export const REST_END_POINTS = {
  LOGO: 'frontend/logo',
  CONFIG: 'config/:id',
  DOWNLOADS: 'downloads',
  JOBS: 'jobs',
};
