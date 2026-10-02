import type { ConfigEntitlements } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';

// React Query's default retry count.
const MAX_RETRIES = 3;

// 403 and 404 are final (no read grant, or the item is gone, e.g. just deleted); retrying them
// would hold usePluginConfigDelete's refetch for the whole backoff.
export const retryConfigEntitlements = (failureCount: number, error: unknown): boolean => {
  const { status } = (error ?? {}) as { status?: number };
  return status !== 403 && status !== 404 && failureCount < MAX_RETRIES;
};

export function useConfigEntitlements(configId: string | undefined) {
  return useApiQuery<ConfigEntitlements>({
    endpoint: `/configs/${configId}/entitlements`,
    method: 'GET',
    queryKey: ['config-entitlements', configId],
    enabled: !!configId,
    retry: retryConfigEntitlements,
    showErrorNotification: false,
  });
}

export function useConfigEntitlementsMutation(configId: string) {
  return useApiMutation<ConfigEntitlements, ConfigEntitlements>({
    endpoint: `/configs/${configId}/entitlements`,
    method: 'PUT',
  });
}
