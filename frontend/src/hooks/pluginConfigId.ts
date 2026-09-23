// ':' keeps the namespaced id within a single URL path segment, matching the
// backend's `/config/{configId}` route. A '/' separator would split into an
// extra path segment and 404. The constant 'plugin:' prefix reserves a
// namespace that the host's own (unprefixed) useConfig calls can never enter.
//
// Single source for both the prefix (usePluginConfig) and the pattern
// (useConfig, deciding whether to attempt a first-access PUT) so they can't
// drift apart from each other. Mirrors the backend's PLUGIN_CONFIG_ID_PATTERN
// (backend/src/constants/constants.ts) — no package straddles frontend/backend,
// so this is duplicated there; keep both in sync if the convention ever changes.
export const PLUGIN_CONFIG_ID_PATTERN = /^plugin:([^:]+):(.+)$/;

export const buildPluginConfigId = (pluginId: string, id: string): string => `plugin:${pluginId}:${id}`;
