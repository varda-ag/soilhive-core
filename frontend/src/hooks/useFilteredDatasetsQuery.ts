import type { FilteredDataset } from 'types/backend';
import { SPLIT_FILTERING_QUERIES } from 'utilities/environmentVariables';
import { useApiQuery } from './useApiQuery';

export function useFilteredDatasetsQuery(filterDataId: string | undefined) {
  const { data, isLoading } = useApiQuery<FilteredDataset[]>({
    endpoint: `/data-filters/${filterDataId}/datasets`,
    method: 'GET',
    queryKey: ['coverage-datasets', filterDataId],
    enabled: !!filterDataId && SPLIT_FILTERING_QUERIES,
    retry: false,
    abortOnNewQuery: true,
  });

  return {
    data,
    isLoading,
  };
}
