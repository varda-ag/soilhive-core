import { useApiMutation } from './useApiMutation';

type MetadataPayload = { value: string };
type MetadataResponse = { id: string; data: MetadataPayload };

export function useMetadataMutation() {
  return useApiMutation<MetadataResponse, MetadataPayload>({
    endpoint: '/config/metadata',
    method: 'PUT',
  });
}
