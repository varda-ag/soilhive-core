import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { queryClient } from '../App';
import { useEntitlements } from './useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';

const getConfigEndpoint = (id: string) => `/config/${id}`;

// Mirrors the backend's PLUGIN_CONFIG_ID_PATTERN (backend/src/constants/constants.ts) — the only
// namespace a non-admin caller may self-claim on first access (see ConfigService.putConfig / ADR
// 0037). Duplicated here rather than shared (no package straddles frontend/backend) — keep both
// in sync if the convention ever changes.
const PLUGIN_CONFIG_ID_PATTERN = /^plugin:([^:]+):(.+)$/;

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
    const hasWrite = can(Capability.WRITE, id);
    // A caller with no WRITE grant yet may still be the id's rightful first claimant: for a
    // plugin: id, the backend runs an atomic first-access bootstrap (ConfigService.putConfig)
    // that self-grants WRITE to whoever wins it. Attempt the PUT and let the backend decide —
    // no-opping here on a pure client-side read of grants (which, by definition, can't exist yet
    // for an unclaimed id) would make that bootstrap unreachable from the UI (see ADR 0037). A
    // non-plugin (system) id has no such bootstrap, so there's nothing to gain from a PUT the
    // backend can only ever 403 — skip it rather than surface a doomed request.
    if (!hasWrite && !PLUGIN_CONFIG_ID_PATTERN.test(id)) {
      return;
    }

    await saveMutation.mutateAsync(newConfig);
    await queryClient.invalidateQueries({ queryKey: [endpoint] });
    if (!hasWrite) {
      // First-access bootstrap just succeeded: the caller now holds a real WRITE grant the
      // cached CONFIGS entitlements (fetched once and reused by `can`) don't know about yet —
      // refetch so `can` reflects it without a full page reload.
      await queryClient.invalidateQueries({ queryKey: ['entitlements', EntitlementScope.CONFIGS] });
    }
  };

  return { config, isLoading, isError, saveConfig };
};

export default useConfig;
