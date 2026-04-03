import type { DatasetFileMappingRequest, DatasetFileMappingResponse } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useCreateDatasetFileMapping() {
  return useApiMutation<DatasetFileMappingResponse, DatasetFileMappingRequest & { datasetId: string }>({
    endpoint: ({ datasetId }) => `/datasets/${datasetId}/dataset-file-mapping`,
    method: 'POST',
  });
}
