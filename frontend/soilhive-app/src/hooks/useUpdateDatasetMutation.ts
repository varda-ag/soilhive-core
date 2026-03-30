import type { Dataset, GeneralInfoFormData } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useUpdateDatasetMutation(id: string) {
  return useApiMutation<Dataset, Partial<GeneralInfoFormData>>({
    endpoint: `/datasets/${id}`,
    method: 'PATCH',
  });
}
