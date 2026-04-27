import type { BackendStoredDataFilter, DataFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useDataFilterQuery(filters: DataFilter, enabled: boolean = true) {
  const { filters: debouncedFilters, enabled: debouncedEnabled } = useDebounce({ filters, enabled }, 300);

  const { data, isLoading } = useApiQuery<BackendStoredDataFilter, DataFilter>({
    endpoint: '/data-filters',
    method: 'POST',
    body: debouncedFilters,
    queryKey: ['data-filter', debouncedFilters],
    enabled: !!debouncedFilters.geometries.length && debouncedEnabled,
    abortOnNewQuery: true,
  });

  return {
    filterId: data?.id,
    selectedFilters: data,
    isLoading,
  };
}
