import type { DataAvailabilityIndex } from '../types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';

export function useDai(
  filterId: string | undefined,
  bbox: [number, number, number, number] | undefined,
  resolution: number | undefined,
  enabled = true,
) {
  const { value: debounced, isPending } = useDebounce({ filterId, bbox, resolution, enabled }, 500);
  const { filterId: debouncedFilterId, bbox: debouncedBbox, resolution: debouncedResolution, enabled: debouncedEnabled } = debounced;

  const isDebouncePending = enabled && isPending;

  const query = new URLSearchParams({
    bbox: debouncedBbox ? debouncedBbox.join(',') : '',
    resolution: debouncedResolution !== undefined ? String(debouncedResolution) : '',
  }).toString();
  const {
    data: dai,
    isLoading,
    isError,
  } = useApiQuery<DataAvailabilityIndex>({
    endpoint: `/data-filters/${debouncedFilterId}/dai?${query}`,
    method: 'GET',
    queryKey: ['dai', debouncedFilterId, debouncedBbox, debouncedResolution],
    enabled: debouncedEnabled && !!debouncedBbox && debouncedBbox.length === 4 && !!debouncedResolution && !!debouncedFilterId,
    abortOnNewQuery: true,
  });

  return {
    dai,
    isLoading: isLoading || isDebouncePending,
    isError,
  };
}
