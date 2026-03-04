import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../utilities/environmentVariables';
import { useQuery } from '@tanstack/react-query';

export function useRaster() {
  const { request } = useRequest();
  // Load all raster filters (regardless of category)
  const { data: allCategories, isLoading } = useQuery({
    queryKey: ['rasterFilters'],
    queryFn: () =>
      request({
        url: `${BACKEND_BASE_URL}/raster-filters`,
        method: 'GET',
      }),
  });

  return {
    allCategories,
    isLoading,
  };
}
