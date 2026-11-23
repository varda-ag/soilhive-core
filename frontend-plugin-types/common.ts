export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
  // A data-admin or super-admin: passes every entitlement check, and deleting a config item
  // deletes it for everyone instead of leaving it (ADR 0083).
  isAdmin?: boolean;
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch?: () => Promise<unknown>;
}

// A failed config call: the HTTP status and the problem body. A 403 on reading a dashboard config
// has `datasets` and `has_unavailable_datasets` in its body; a 409 on deleting one has
// `shared_with_everyone` (ADR 0083).
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

export interface PluginConfigInviteInput {
  // What redeeming grants on the config item. Only a caller with write on it can create one.
  capabilities: PluginConfigEntitlementCapability[];
  // Only the person signed in with this email can redeem it. Never with reusable.
  recipient?: string;
  // Redeemable by many until it expires; single use when left out.
  reusable?: boolean;
  // 1 to 30; 7 when left out.
  expiresInDays?: number;
}

// A refused Invite redemption: the HTTP status and the problem body (see ADR 0081). 404: unknown or
// withdrawn. 410: used up or expired. 403: for another account (`recipient_hint` in the body, e.g.
// `j•••@example.com`), the sign-in has no email (`email_required`), or the creator can no longer share it.
export interface PluginInviteRedeemError {
  status: number;
  body: unknown;
}

export interface PluginConfigInvite {
  id: string;
  // Returned only here, never again: put it in the link's fragment (#...), so servers never log it.
  token: string;
  // ISO 8601 in UTC.
  expiresAt: string;
}

// 'datasets' is excluded: dataset entitlements are keyed by real Dataset entities, never
// plugin:{pluginId}:... ids, so that scope can never be non-empty for a plugin (see ADR 0036).
export type PluginEntitlementScope = 'configs' | 'dashboards';
