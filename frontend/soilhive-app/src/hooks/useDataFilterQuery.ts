import type { BackendStoredDataFilter, DataFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useDataFilterQuery(filters: DataFilter, enabled: boolean = true, debounceTime: number = 300) {
  const { value: debounced, isPending } = useDebounce({ filters, enabled }, debounceTime);
  const { filters: debouncedFilters, enabled: debouncedEnabled } = debounced;

  // The debounce window counts as loading — without this, isLoading is false for debounceTime
  // between when inputs change and when the query actually starts.
  const isDebouncePending = enabled && isPending;

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
    isLoading: isLoading || isDebouncePending,
  };
}
