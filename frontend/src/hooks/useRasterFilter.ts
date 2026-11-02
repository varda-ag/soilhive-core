import { RasterFilterInstallStatus, type RasterFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';

const POLLING_MS = 2000;
const FINAL_INSTALL_STATUSES: RasterFilterInstallStatus[] = [RasterFilterInstallStatus.INSTALLED, RasterFilterInstallStatus.FAILED];

// pollInstall keeps refetching until the install is installed or failed
export function useRasterFilter(id: string | null | undefined, { pollInstall = false }: { pollInstall?: boolean } = {}) {
  return useApiQuery<RasterFilter>({
    endpoint: `/raster-filters/${id}`,
    method: 'GET',
    queryKey: ['rasterFilter', id],
    enabled: !!id,
    disableCache: true,
    refetchInterval: pollInstall
      ? query => {
          const status = query.state.data?.install?.status;
          return status && FINAL_INSTALL_STATUSES.includes(status) ? false : POLLING_MS;
        }
      : undefined,
  });
}
