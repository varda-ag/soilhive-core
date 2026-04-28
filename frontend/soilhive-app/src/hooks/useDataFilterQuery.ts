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

  // True when the current `filterId` does not yet correspond to the current input filters:
  // either no response has arrived, or the input changed and the new POST /data-filters
  // hasn't completed (it's still inside the 300ms debounce window or in flight).
  // Consumers gate dependent queries on `!isStale` to avoid firing them with a stale `filterId`.
  const isStale = !data || JSON.stringify(data.filter) !== JSON.stringify(filters);

  return {
    filterId: data?.id,
    selectedFilters: data,
    isLoading,
    isStale,
  };
}
