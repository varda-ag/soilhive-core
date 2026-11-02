import { RasterFilterInstallStatus, type RasterFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';

const POLLING_MS = 2000;
const MAX_RETRIES = 3;
// Nothing changes a not installed filter on its own: its install is never started from the edit page
const FINAL_INSTALL_STATUSES: RasterFilterInstallStatus[] = [
  RasterFilterInstallStatus.NOT_INSTALLED,
  RasterFilterInstallStatus.INSTALLED,
  RasterFilterInstallStatus.FAILED,
];

// A wrong id or a missing filter will not change on retry, so it fails at once; other errors keep the default retries
const retry = (failureCount: number, error: Error) => {
  const status = (error as { status?: number }).status;
  return !(status && status >= 400 && status < 500) && failureCount < MAX_RETRIES;
};

// pollInstall keeps refetching until the install ends or the request fails
export function useRasterFilter(id: string | null | undefined, { pollInstall = false }: { pollInstall?: boolean } = {}) {
  return useApiQuery<RasterFilter>({
    endpoint: `/raster-filters/${id}`,
    method: 'GET',
    queryKey: ['rasterFilter', id],
    enabled: !!id,
    disableCache: true,
    retry,
    refetchInterval: pollInstall
      ? query => {
          if (query.state.status === 'error') return false;
          const status = query.state.data?.install?.status;
          return status && FINAL_INSTALL_STATUSES.includes(status) ? false : POLLING_MS;
        }
      : undefined,
  });
}
