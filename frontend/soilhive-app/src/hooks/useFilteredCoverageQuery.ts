import type { FilteredData } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function useFilteredCoverageQuery(filterDataId: string | undefined) {
  const { data, isLoading } = useApiQuery<FilteredData>({
    endpoint: `/data-filters/${filterDataId}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterDataId],
    enabled: !!filterDataId,
    retry: false,
  });

  return {
    data,
    isLoading,
  };
}
