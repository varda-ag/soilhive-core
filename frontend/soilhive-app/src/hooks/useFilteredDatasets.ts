import type { BackendStoredDataFilter, DataFilter, FilteredData } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useFilteredDatasets(filters: DataFilter, enabled: boolean = true) {
  const debouncedFilters = useDebounce(filters, 300);

  const { data: filterData, isLoading: isFilterLoading } = useApiQuery<BackendStoredDataFilter, DataFilter>({
    endpoint: '/data-filters',
    method: 'POST',
    body: debouncedFilters,
    queryKey: ['data-filter', debouncedFilters],
    enabled: !!debouncedFilters.geometries.length && enabled,
  });

  const { data: coverageData, isLoading: isCoverageLoading } = useApiQuery<FilteredData>({
    endpoint: `/data-filters/${filterData?.id}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterData?.id],
    enabled: !!filterData?.id && enabled,
    retry: false,
  });

  return {
    filterId: filterData?.id,
    selectedFilters: filterData,
    data: coverageData,
    isLoading: isFilterLoading || isCoverageLoading,
  };
}
