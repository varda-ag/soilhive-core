# GET /configs returns each config with its update time

**Status:** Accepted

The dashboards plugin sorts its list by "last update" (SP-5863). `jsonstorage.updated_at` already holds that time: `putConfig` upserts, and TypeORM sets `updated_at = DEFAULT` on the conflict update. So `GET /configs` now returns `{ [id]: { data, updated_at } }` instead of `{ [id]: data }`, and `usePluginConfigs` returns `Record<id, { config, updatedAt }>` to plugins.

## Considered options

- **A new endpoint for the times, e.g. `GET /configs-metadata` (rejected).** No break, but a list that polls `GET /configs` must poll a second endpoint too.
- **Keep `usePluginConfigs.data` and add a separate `updatedAt` map (rejected).** Old plugins would keep working on a new host. But a reader must match ids across two maps, and the only caller (the dashboards plugin) is released with the host.

## Consequences

- This breaks the HTTP shape and the plugin contract. `useConfigs` is the only caller of `GET /configs`, and the dashboards plugin is the only user of `usePluginConfigs`. Release the host and the plugin together.
- `POST /configs-export` keeps its `{ [id]: data }` shape, so exported files still import.
- An entitlement change does not touch the row, so it does not change `updated_at`.
