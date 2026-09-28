import type { BackendStoredDataFilter } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function useFilter(filterId: string | undefined) {
  const { data, isLoading, isError } = useApiQuery<BackendStoredDataFilter>({
    endpoint: `/data-filters/${filterId}`,
    method: 'GET',
    queryKey: ['data-filter', filterId],
    enabled: !!filterId,
    // A missing filter is a 404; retrying won't change that.
    retry: false,
  });

  return {
    filter: data,
    isLoading,
    isError,
  };
}
