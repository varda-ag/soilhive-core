import type { Dataset, GeneralInfoFormData, DatasetFileMappingRequest, DatasetFileMappingResponse, License } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useUpdateDatasetFileMappingMutation() {
  return useApiMutation<DatasetFileMappingResponse, { datasetId: string; datasetFileMappingId: string; mappingId: string }>({
    endpoint: ({ datasetId, datasetFileMappingId }) => `/datasets/${datasetId}/dataset-file-mapping/${datasetFileMappingId}`,
    method: 'PATCH',
  });
}

export function useCreateDatasetMutation() {
  return useApiMutation<Dataset, GeneralInfoFormData>({
    endpoint: '/datasets',
    method: 'POST',
  });
}

export function useUpdateDatasetMutation(id: string) {
  return useApiMutation<Dataset, Partial<Dataset>>({
    endpoint: `/datasets/${id}`,
    method: 'PATCH',
  });
}

export function useUpdateDatasetVisibilityMutation(id: string) {
  return useApiMutation<Dataset, { visibility: string }>({
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

export function useDeleteDatasetMutation() {
  return useApiMutation<void, { datasetId: string }>({
    endpoint: ({ datasetId }) => `/datasets/${datasetId}`,
    method: 'DELETE',
  });
}

export function useCreateLicenseMutation() {
  return useApiMutation<License, { name: string; full_name?: string; url?: string }>({
    endpoint: '/licenses',
    method: 'POST',
  });
}
