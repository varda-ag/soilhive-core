import type { DataAvailabilityIndex } from '../types/backend';
import { useApiQuery } from './useApiQuery';

export function useDai(bbox: [number, number, number, number], resolution: number, enabled = true) {
  const {
    data: dai,
    isLoading,
    isError,
  } = useApiQuery<DataAvailabilityIndex>({
    endpoint: '/frontend/dai?' + new URLSearchParams({ bbox: bbox.join(','), resolution: String(resolution) }).toString(),
    method: 'GET',
    queryKey: ['dai', bbox, resolution],
    enabled: enabled && !!bbox && bbox.length === 4 && resolution >= 0,
    abortOnNewQuery: true,
  });

  return {
    dai,
    isLoading,
    isError,
  };
}
