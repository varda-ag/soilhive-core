import type { DatasetEntitlements } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';

export function useDatasetEntitlements(datasetId: string | undefined) {
  return useApiQuery<DatasetEntitlements>({
    endpoint: `/datasets/${datasetId}/entitlements`,
    method: 'GET',
    queryKey: ['dataset-entitlements', datasetId],
    enabled: !!datasetId,
  });
}

export function useDatasetEntitlementsMutation(datasetId: string) {
  return useApiMutation<DatasetEntitlements, DatasetEntitlements>({
    endpoint: `/datasets/${datasetId}/entitlements`,
    method: 'PUT',
  });
}
