import { useApiQuery } from './useApiQuery';
import type { DatasetError } from 'types/datasetErrors';

export function useDatasetErrors() {
  const { data: datasetErrors, isLoading } = useApiQuery<DatasetError[]>({
    endpoint: '/errors/datasets',
    method: 'GET',
    queryKey: ['datasetErrors'],
    enabled: true,
  });

  return { datasetErrors, isLoading };
}
