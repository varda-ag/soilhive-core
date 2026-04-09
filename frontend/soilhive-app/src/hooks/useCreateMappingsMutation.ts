import type { DataMappingResponse, DataMappingRequest } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useCreateMappingsMutation() {
  return useApiMutation<DataMappingResponse, DataMappingRequest>({
    endpoint: '/mappings',
    method: 'POST',
  });
}
