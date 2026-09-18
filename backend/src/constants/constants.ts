import { TOKEN_ISSUER, TokenScopes } from '../types/enums';

export const MAX_PROPERTY_LEVEL = 2;
export const DATA_PREVIEW_SIZE = 20;
export const OUTSIDE_LOD_VALUE = -999;
export const EVERYONE = 'everyone';
export const FRONTEND_LOGO_CONFIG_ID = 'frontend-logo';
export const CSV_HASHES_CONFIG_ID = 'vocabulary-csv-hashes';
/**
 * Matches the `plugin:${pluginId}:${id}` config id convention `usePluginConfig`
 * (frontend/src/hooks/usePluginConfig.ts) already uses for every plugin-owned config, capturing
 * `id` (group 2) for callers that need the id with its plugin prefix stripped (see
 * `EntitlementService.selectByScope`). This is also the only namespace a non-privileged caller may
 * claim on first access (see `EntitlementService.assertCanWriteConfigEntitlement`) — a system
 * config id (`frontend-logo`, `theme`, `ingestion-status`, `vocabulary-csv-hashes`, ...) never
 * matches it. One pattern for both so the two checks can't drift apart.
 */
export const PLUGIN_CONFIG_ID_PATTERN = /^plugin:([^:]+):(.+)$/;
export const INTERNAL_REQUEST_TOKEN_PAYLOAD = {
  sub: TokenScopes.INTERNAL_REQUEST,
  iss: TOKEN_ISSUER,
  scope: `${TokenScopes.INTERNAL_REQUEST} ${TokenScopes.DATA_ADMIN}`,
  email: `${TokenScopes.INTERNAL_REQUEST}@localhost`,
};
