import type { Dataset, GeneralInfoFormData, DatasetFileMappingRequest, DatasetFileMappingResponse } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useCreateDatasetMutation() {
  return useApiMutation<Dataset, GeneralInfoFormData>({
    endpoint: '/datasets',
    method: 'POST',
  });
}

export function useUpdateDatasetMutation(id: string) {
  return useApiMutation<Dataset, Partial<GeneralInfoFormData>>({
    endpoint: `/datasets/${id}`,
    method: 'PATCH',
  });
}

export function useCreateDatasetFileMapping() {
  return useApiMutation<DatasetFileMappingResponse, DatasetFileMappingRequest & { datasetId: string }>({
    endpoint: ({ datasetId }) => `/datasets/${datasetId}/dataset-file-mapping`,
    method: 'POST',
  });
}
