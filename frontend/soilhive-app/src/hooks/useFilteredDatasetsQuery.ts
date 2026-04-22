import type { FilteredDataset } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function useFilteredDatasetsQuery(filterDataId: string | undefined) {
  const { data, isLoading } = useApiQuery<FilteredDataset[]>({
    endpoint: `/data-filters/${filterDataId}/datasets`,
    method: 'GET',
    queryKey: ['coverage-datasets', filterDataId],
    enabled: !!filterDataId,
    retry: false,
  });

  return {
    data,
    isLoading,
  };
}
