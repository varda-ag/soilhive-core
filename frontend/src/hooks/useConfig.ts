import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { useEntitlements } from './useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';
import { PLUGIN_CONFIG_ID_PATTERN } from './pluginConfigId';

const getConfigEndpoint = (id: string) => `/configs/${id}`;

const useConfig = <T>(id: string, defaultConfig?: T) => {
  const { can } = useEntitlements(EntitlementScope.CONFIGS);
  const queryClient = useQueryClient();
  const endpoint = getConfigEndpoint(id);
  const queryKey = [endpoint];
  const saveMutation = useApiMutation<T, unknown>({
    endpoint,
    method: 'PUT',
  });

  // Must not force authenticate: false — GET is entitlements-gated now, so a logged-in caller's
  // token needs to be sent when present (see ADR 0037).
  const { data, isLoading, isError } = useApiQuery<T>({
    endpoint,
    method: 'GET',
    queryKey,
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

    // The PUT returns the stored config (the same body as GET), so it goes straight into the cache.
    const savedConfig = await saveMutation.mutateAsync(newConfig);
    // A GET still running may have read the server before the PUT: cancel it, or it overwrites the
    // saved config with the old one when it finishes.
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, savedConfig);
    if (!hasWrite) {
      // First-access bootstrap just succeeded — refresh the cached CONFIGS entitlements so `can`
      // reflects the new grant. Not awaited: only later can() checks need it, and a failed refresh
      // must not fail a save that already succeeded.
      void queryClient.invalidateQueries({ queryKey: ['entitlements', EntitlementScope.CONFIGS] }).catch(() => {});
    }
  };

  return { config, isLoading, isError, saveConfig };
};

export default useConfig;
