import type { FilteredData } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function useFilteredCoverageQuery(filterDataId: string | undefined, geometryOnly: boolean = false) {
  const { data, isLoading } = useApiQuery<FilteredData>({
    endpoint: `/data-filters/${filterDataId}/coverage${geometryOnly ? '?geometryOnly=true' : ''}`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterDataId, geometryOnly],
    enabled: !!filterDataId,
    retry: false,
    abortOnNewQuery: true,
  });

  return {
    data,
    isLoading,
  };
}
