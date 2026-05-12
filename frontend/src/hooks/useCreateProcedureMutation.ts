import type { ProcedurePayload, ProcedureResponse } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export function useCreateProcedureMutation() {
  return useApiMutation<ProcedureResponse, ProcedurePayload>({
    endpoint: '/procedures',
    method: 'POST',
  });
}
