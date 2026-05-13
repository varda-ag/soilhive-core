import type { DataAvailabilityIndex } from '../types/backend';
import { useApiQuery } from './useApiQuery';

export function useDai(
  filterId: string | undefined,
  bbox: [number, number, number, number] | undefined,
  resolution: number | undefined,
  enabled = true,
) {
  const query = new URLSearchParams({
    bbox: bbox ? bbox.join(',') : '',
    resolution: resolution !== undefined ? String(resolution) : '',
  }).toString();
  const {
    data: dai,
    isLoading,
    isError,
  } = useApiQuery<DataAvailabilityIndex>({
    endpoint: `/data-filters/${filterId}/dai?${query}`,
    method: 'GET',
    queryKey: ['dai', filterId, bbox, resolution],
    enabled: enabled && !!bbox && bbox.length === 4 && !!resolution && !!filterId,
    abortOnNewQuery: true,
  });

  return {
    dai,
    isLoading,
    isError,
  };
}
