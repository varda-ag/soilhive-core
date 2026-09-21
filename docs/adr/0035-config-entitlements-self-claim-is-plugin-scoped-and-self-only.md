# Config entitlements become writable via a plugin-scoped, self-only first claim

ADR 0032 namespaced Entitlements by scope but left `configs` read-only: nothing called
`setEntityEntitlements(CONFIGS, ...)`, and no endpoint let a caller write one. This ticket adds
that write path — `PUT`/`GET /config/{configId}/entitlements` — and with it, the question ADR
0032 deferred: who may hold `write` on a config item's Entitlements at all, given no admin has to
create them first the way a Dataset's row already exists before anyone requests access to it.

We decided a non-privileged caller may claim `write` on a config item's own Entitlements exactly
once, on a genuine first access: no Entitlement grant exists yet for that id, no `ConfigItem` has
ever been stored under it (`ConfigService`/`JsonStorage`, including one since soft-deleted), and
the id follows the `plugin:{pluginId}:{id}` convention `usePluginConfig`
(`frontend/src/hooks/usePluginConfig.ts`) already builds. The claim itself must grant `write` to
the caller's own **Subject** and nothing else in the same call. Every other write — a first access
failing any of those conditions, or a write once someone already holds a grant — requires an
existing `write` grant or a **Privileged caller**, same as a Dataset's Entitlements always have.

Scoping first access to the `plugin:` namespace is what makes self-service safe without a registry
of legitimate config ids: every system config (`frontend-logo`, `theme`,
`vocabulary-csv-hashes`, ...) is permanently ineligible for self-service by construction, with
nothing to maintain as new system configs are added — `PLUGIN_CONFIG_ID_PATTERN` is the one
guardrail. Restricting the claim to the caller's own Subject keeps a bootstrap claim attributable
to a real, authenticated identity, and stops the same call from smuggling in grants for other
subjects (e.g. `everyone`) before anyone holds `write` at all.

## Considered options

- **Gate first access on a registry of legitimate plugin ids, instead of the `plugin:` naming
  convention**: rejected, same reasoning as ADR 0032's rejection of a `Config`/`Dashboard` entity
  — no such registry exists anywhere in the codebase today, and inventing one is a separate,
  larger feature.
- **Allow first access on any config id, not only `plugin:`-prefixed ones**: rejected — a fresh
  system config id is indistinguishable from a fresh plugin id by grant-and-existence alone; both
  have no grant yet and no `ConfigItem` yet. Scoping to `plugin:` is the only way to tell them
  apart without a registry, and it must stay admin-only for every system id, forever.
- **Let a first-access payload grant arbitrary subjects, not only the caller**: rejected — lets an
  anonymous-in-practice claim be filed under any string the caller invents, and lets the same call
  plant grants for other subjects before anyone legitimately holds `write`. See Consequences for
  what this does not solve even with the restriction in place.

## Consequences

- Nothing today ties a `plugin:{pluginId}:...` id's `pluginId` segment to the caller — any
  authenticated, non-admin user can be first to claim any plugin's config id, not only that
  plugin's own users. Accepted for now: `PUT`/`GET`/`DELETE /config/{configId}` (the config's
  actual value) stay admin-only and consult no Entitlement, so a squatted claim currently controls
  nothing beyond the Entitlements row itself. A planned follow-up opens those endpoints to
  non-admins, gated by these same capabilities — at which point plugin-id ownership needs
  revisiting, likely by folding first access into the value's own write path instead of leaving it
  on the Entitlements endpoint.
- The first-access check and write are not atomic: two concurrent first-access `PUT`s on the same
  fresh id can both pass the check, and the loser's grant is silently overwritten
  (`setEntityEntitlements` is a full delete-then-insert). Deferred to the same follow-up above,
  where first access is expected to move onto the config value's write path and become atomic via
  `JsonStorage`'s existing primary key, rather than being patched here in isolation.
- `GET /config/{configId}/entitlements` has no analogous first-access bypass — a non-admin caller
  checking whether they already own an unclaimed id gets a 403, which must be read as "unclaimed",
  not "denied" (documented on that operation in `openapi.yaml`).
- A caller holding only `read` (not `write`) is shown only their own grant plus `everyone`'s on
  `GET`, not the full subject list; `write` is required to see (and so manage) every grant. This
  differs from `GET /datasets/{datasetId}/entitlements`, which stays fully admin-only and always
  returns every subject.
- `ConfigService.deleteConfig` (a soft delete) does not clear the id's Entitlements. Deleting a
  config's value does not free its id back up for self-service — it stays claimed by whoever
  already holds `write`, or requires an admin. Revisit alongside the follow-up above if "delete
  frees the id" becomes desired behavior.
