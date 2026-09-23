import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { queryClient } from '../App';
import { useEntitlements } from './useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';

const getConfigEndpoint = (id: string) => `/config/${id}`;

const useConfig = <T>(id: string, defaultConfig?: T) => {
  const { can } = useEntitlements(EntitlementScope.CONFIGS);
  const endpoint = getConfigEndpoint(id);
  const saveMutation = useApiMutation<{ id: string }, unknown>({
    endpoint,
    method: 'PUT',
  });

  // GET is entitlements-gated on the backend (READ/WRITE, or EVERYONE's grant), and the backend
  // validates an Authorization header whenever one is sent, security block or not — so this must
  // NOT force authenticate: false. Omitting it sends the caller's token when they're logged in
  // (needed to read their own WRITE-held plugin config, or as an admin), while still sending none
  // when they're not (ThemeContext/logo must still render before login — see ADR-0037).
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
    if (can(Capability.WRITE, id)) {
      await saveMutation.mutateAsync(newConfig);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
    }
  };

  return { config, isLoading, isError, saveConfig };
};

export default useConfig;
