import type { Dataset, GeneralInfoFormData } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useCreateDatasetMutation() {
  return useApiMutation<Dataset, GeneralInfoFormData>({
    endpoint: '/datasets',
    method: 'POST',
  });
}
