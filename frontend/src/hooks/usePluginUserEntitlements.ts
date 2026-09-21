import type { PluginConfigEntitlements, PluginEntitlementScope } from 'frontend-plugin-types';
import { EntitlementScope } from 'types/backend';
import { useUserEntitlements } from './useUserEntitlements';

const SCOPE_MAP: Record<PluginEntitlementScope, EntitlementScope> = {
  configs: EntitlementScope.CONFIGS,
  dashboards: EntitlementScope.DASHBOARDS,
};

// Filters the host's full grant map down to the calling plugin's own plugin:{pluginId}:
// entries and strips the prefix, mirroring usePluginConfigs — see ADR 0036.
export function usePluginUserEntitlements(pluginId: string, scope: PluginEntitlementScope) {
  const { data, isLoading, isError } = useUserEntitlements(SCOPE_MAP[scope]);
  const prefix = `plugin:${pluginId}:`;

  const filtered: PluginConfigEntitlements = Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, capabilities]) => [key.slice(prefix.length), capabilities as PluginConfigEntitlements[string]]),
  );

  return { data: filtered, isLoading, isError };
}
