import type { DatasetFilter, PostDatasetFilterResponse, StoredDatasetFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useFilteredDatasets(filters: DatasetFilter) {
  const debouncedFilters = useDebounce(filters, 300);

  const { data: filterData } = useApiQuery<StoredDatasetFilter, DatasetFilter>({
    endpoint: '/data-filters',
    method: 'POST',
    body: debouncedFilters,
    queryKey: ['data-filter', debouncedFilters],
    enabled: !!debouncedFilters.geometries.length,
  });

  return useApiQuery<PostDatasetFilterResponse>({
    endpoint: `/data-filters/${filterData?.id}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterData?.id],
    enabled: !!filterData?.id,
  });
}
