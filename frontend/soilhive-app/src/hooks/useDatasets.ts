import type { Dataset } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function useDatasets() {
  const {
    data: datasets,
    isLoading,
    isError,
  } = useApiQuery<Dataset[]>({
    endpoint: '/datasets',
    method: 'GET',
    queryKey: ['datasets'],
    enabled: true,
  });

  return {
    datasets,
    isLoading,
    isError,
  };
}

export function useDataset(id: string | undefined) {
  return useApiQuery<Dataset>({
    endpoint: `/datasets/${id}`,
    method: 'GET',
    queryKey: ['dataset', id],
    enabled: !!id,
  });
}
