import { useCallback, useMemo } from 'react';
import type { PluginAccessRequest, PluginAccessRequestInput, PluginMutationResult } from 'frontend-plugin-types';
import type { AccessRequestCreateBody, AccessRequestCreated } from 'types/backend';
import { useApiMutation } from './useApiMutation';

// An Access Request for the signed-in user (see ADR 0081, 0082). Not namespaced by plugin: it names
// Datasets, which are the host's. A refusal is toasted by the host, with the backend's message.
export function useAccessRequestCreate(): PluginMutationResult<PluginAccessRequestInput, PluginAccessRequest> {
  const {
    mutateAsync: createAccessRequest,
    isPending,
    isError,
  } = useApiMutation<AccessRequestCreated, AccessRequestCreateBody>({
    endpoint: '/access-requests',
    method: 'POST',
  });

  const mutateAsync = useCallback(
    async ({ datasets, capabilities, message }: PluginAccessRequestInput): Promise<PluginAccessRequest> => {
      const accessRequest = await createAccessRequest({
        datasets,
        capabilities,
        ...(message !== undefined && { message }),
      });
      return { id: accessRequest.id, status: accessRequest.status, createdAt: accessRequest.created_at };
    },
    [createAccessRequest],
  );

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
}
