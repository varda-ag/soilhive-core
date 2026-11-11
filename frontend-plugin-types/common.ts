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
  refetch?: () => Promise<unknown>;
}

// A failed config read: the HTTP status and the problem body. A 403 on a dashboard config has
// `datasets` and `has_unavailable_datasets` in its body.
export interface PluginConfigError {
  status: number;
  body: unknown;
}

export interface PluginConfigResult<T> {
  config: T | undefined;
  isLoading: boolean;
  isError: boolean;
  // Set on a failed read, except a 404, which reads as the default config.
  error?: PluginConfigError | undefined;
  saveConfig: (config: T) => Promise<void>;
}

export interface PluginConfigEntry<T> {
  config: T;
  // ISO 8601 in UTC (ends in `Z`): the last save of the item. Show it with `new Date(updatedAt)`,
  // formatted in the user's locale (e.g. `toLocaleString`), not by slicing the string.
  updatedAt: string;
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
