import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../utilities/environmentVariables';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RasterFilterCategory } from 'types/backend';

export function useRaster() {
  const { request } = useRequest<RasterFilterCategory[]>();
  const queryClient = useQueryClient();

  // Load all raster filters (regardless of category)
  const { data: allCategories, isLoading } = useQuery({
    queryKey: ['rasterFilters'],
    queryFn: () =>
      request({
        url: `${BACKEND_BASE_URL}/raster-filters`,
        method: 'GET',
      }),
    select: categories => [...(categories ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  });

  const { mutate: mutateActive, isPending } = useMutation({
    mutationFn: ({ rasterFilterId, active }: { rasterFilterId: string; active: boolean }) =>
      request({
        url: `${BACKEND_BASE_URL}/raster-filters/${rasterFilterId}`,
        method: 'PATCH',
        body: { active },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rasterFilters'] }),
  });

  const setCategoryActive = (rasterFilterId: string, active: boolean) => mutateActive({ rasterFilterId, active });

  return {
    allCategories,
    isLoading: isLoading || isPending,
    setCategoryActive,
  };
}
