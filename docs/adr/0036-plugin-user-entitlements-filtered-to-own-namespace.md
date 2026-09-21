# Plugin-facing user entitlements are filtered and unprefixed to the caller's own namespace

`GET /entitlements?scope=` returns the caller's entire grant map for the requested namespace,
unfiltered — for `configs` and `dashboards` that includes every config id the caller holds a grant
on, host-owned (`frontend-logo`, `theme`, ...) and every other plugin's `plugin:{pluginId}:...`
ids alike (`EntitlementService.selectByScope`, `backend/src/services/EntitlementService.ts:196-206`).
Passing that raw map straight into `PluginContext` would let any plugin see which configs other
plugins (or the host) have claimed and what capabilities were granted on them — a namespace leak
across the module-federation boundary that would be hard to walk back once a plugin depended on
the raw shape.

We decided the plugin-facing hook (`usePluginUserEntitlements(pluginId, scope)`) filters the host
hook's result down to keys matching `plugin:{pluginId}:` for the calling plugin's own id, and
strips the prefix before returning — mirroring the existing `usePluginConfigs` pattern
(`frontend/src/hooks/usePluginConfigs.ts`). A plugin only ever sees its own claimed entries, never
another plugin's or the host's.

`scope` is typed as a new plugin-safe `'configs' | 'dashboards'` string union in
`frontend-plugin-types`, not the host's `EntitlementScope` enum — consistent with the existing
precedent (`ConfigEntitlements`/`DatasetEntitlements` using plain string unions, not enums, to
cross the plugin boundary without a cast) — and `'datasets'` is excluded entirely: dataset
entitlements are keyed by real `Dataset` entities (`backend/src/types/Entitlements.ts:20-23`), a
keyspace with no `plugin:{pluginId}:...` ids, so it can never be non-empty for a plugin no matter
how it's filtered.

## Considered options

- **Pass the raw, unfiltered map through, with `scope` typed as the host's full `EntitlementScope`**:
  rejected — leaks cross-plugin and host entitlement data, and lets a plugin pass `'datasets'` for
  a param that can only ever resolve to `{}`.
- **Hardcode `scope` to `'configs'` only, drop the parameter entirely**: rejected once it became
  clear `selectByScope`'s subkey match strips the `plugin:{pluginId}:` prefix before comparing
  against `dashboards`/`dashboards_*` (`EntitlementService.ts:190-194`) — a plugin's own
  `dashboards_1`-named config genuinely surfaces under `scope=dashboards`, so that scope is live for
  plugins, not dead.
