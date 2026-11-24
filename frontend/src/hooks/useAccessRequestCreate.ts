import { useCallback, useMemo } from 'react';
import type { PluginAccessRequest, PluginAccessRequestError, PluginAccessRequestInput, PluginMutationResult } from 'frontend-plugin-types';
import type { AccessRequestCreateBody, AccessRequestCreated } from 'types/backend';
import { useApiMutation } from './useApiMutation';

// An Access Request for the signed-in user (see ADR 0081, 0082). Not namespaced by plugin: it names
// Datasets, which are the host's. No toast: the plugin says what went wrong, as only it knows the form.
export function useAccessRequestCreate(): PluginMutationResult<PluginAccessRequestInput, PluginAccessRequest> {
  const {
    mutateAsync: createAccessRequest,
    isPending,
    isError,
  } = useApiMutation<AccessRequestCreated, AccessRequestCreateBody>({
    endpoint: '/access-requests',
    method: 'POST',
    showErrorNotification: false,
  });

  const mutateAsync = useCallback(
    async ({ datasets, capabilities, message }: PluginAccessRequestInput): Promise<PluginAccessRequest> => {
      let accessRequest: AccessRequestCreated;
      try {
        accessRequest = await createAccessRequest({
          datasets,
          capabilities,
          ...(message !== undefined && { message }),
        });
      } catch (error) {
        const { status, raw } = (error ?? {}) as { status?: number; raw?: unknown };
        throw { status: status ?? 0, body: raw } satisfies PluginAccessRequestError;
      }
      return { id: accessRequest.id, status: accessRequest.status, createdAt: accessRequest.created_at };
    },
    [createAccessRequest],
  );

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
}
