import type { DataFilter, FilteredDataset, StoredDataFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useFilteredDatasets(filters: DataFilter) {
  const debouncedFilters = useDebounce(filters, 300);

  const { data: filterData, isLoading: isFilterLoading } = useApiQuery<StoredDataFilter, DataFilter>({
    endpoint: '/data-filters',
    method: 'POST',
    body: debouncedFilters,
    queryKey: ['data-filter', debouncedFilters],
    enabled: !!debouncedFilters.geometries.length,
  });

  const { data: coverageData, isLoading: isCoverageLoading } = useApiQuery<FilteredDataset[]>({
    endpoint: `/data-filters/${filterData?.id}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterData?.id],
    enabled: !!filterData?.id,
  });

  return {
    data: coverageData,
    isLoading: isFilterLoading || isCoverageLoading,
  };
}
