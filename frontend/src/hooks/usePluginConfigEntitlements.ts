import { useConfigEntitlements, useConfigEntitlementsMutation } from './useConfigEntitlements';

// See usePluginConfig.ts for why the 'plugin:{pluginId}:{id}' namespacing is used.
export function usePluginConfigEntitlements(pluginId: string, configId: string) {
  return useConfigEntitlements(`plugin:${pluginId}:${configId}`);
}

export function usePluginConfigEntitlementsMutation(pluginId: string, configId: string) {
  return useConfigEntitlementsMutation(`plugin:${pluginId}:${configId}`);
}
