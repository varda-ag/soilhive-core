export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface PluginConfigResult<T> {
  config: T | undefined;
  isLoading: boolean;
  isError: boolean;
  saveConfig: (config: T) => Promise<void>;
}

export interface PluginMutationResult<TInput, TOutput> {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
  isError: boolean;
}

export type PluginConfigEntitlementCapability = 'read' | 'write';
export type PluginConfigEntitlements = Record<string, PluginConfigEntitlementCapability[]>;

// 'datasets' is excluded: dataset entitlements are keyed by real Dataset entities, never
// plugin:{pluginId}:... ids, so that scope can never be non-empty for a plugin (see ADR 0036).
export type PluginEntitlementScope = 'configs' | 'dashboards';
