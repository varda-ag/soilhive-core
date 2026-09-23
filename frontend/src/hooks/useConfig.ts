import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { useEntitlements } from './useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';
import { PLUGIN_CONFIG_ID_PATTERN } from './pluginConfigId';

const getConfigEndpoint = (id: string) => `/config/${id}`;

const useConfig = <T>(id: string, defaultConfig?: T) => {
  const { can } = useEntitlements(EntitlementScope.CONFIGS);
  const queryClient = useQueryClient();
  const endpoint = getConfigEndpoint(id);
  const saveMutation = useApiMutation<{ id: string }, unknown>({
    endpoint,
    method: 'PUT',
  });

  // Must not force authenticate: false — GET is entitlements-gated now, so a logged-in caller's
  // token needs to be sent when present (see ADR 0037).
  const { data, isLoading, isError } = useApiQuery<T>({
    endpoint,
    method: 'GET',
    queryKey: [endpoint],
    enabled: !!id,
    showErrorNotification: false,
    notFoundAsNull: true,
  });

  // Backfill top-level keys that are missing in fetched data, keeping stored values
  // where present. (data ?? defaultConfig handles the not-found / null case.)
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

  const config: T | undefined = isObject(data) && isObject(defaultConfig) ? { ...defaultConfig, ...data } : (data ?? defaultConfig);

  const saveConfig = async (newConfig: unknown): Promise<void> => {
    const hasWrite = can(Capability.WRITE, id);
    // Attempt plugin: ids even without a grant yet — first access is claimed by PUT itself, and
    // no-opping here would make that bootstrap unreachable from the UI (see ADR 0037).
    if (!hasWrite && !PLUGIN_CONFIG_ID_PATTERN.test(id)) {
      return;
    }

    await saveMutation.mutateAsync(newConfig);
    await queryClient.invalidateQueries({ queryKey: [endpoint] });
    if (!hasWrite) {
      // First-access bootstrap just succeeded — refresh the cached CONFIGS entitlements so `can`
      // reflects the new grant.
      await queryClient.invalidateQueries({ queryKey: ['entitlements', EntitlementScope.CONFIGS] });
    }
  };

  return { config, isLoading, isError, saveConfig };
};

export default useConfig;
