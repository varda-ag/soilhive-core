import type { ConfigEntitlements } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';

export function useConfigEntitlements(configId: string | undefined) {
  return useApiQuery<ConfigEntitlements>({
    endpoint: `/config/${configId}/entitlements`,
    method: 'GET',
    queryKey: ['config-entitlements', configId],
    enabled: !!configId,
    showErrorNotification: false,
  });
}

export function useConfigEntitlementsMutation(configId: string) {
  return useApiMutation<ConfigEntitlements, ConfigEntitlements>({
    endpoint: `/config/${configId}/entitlements`,
    method: 'PUT',
  });
}
