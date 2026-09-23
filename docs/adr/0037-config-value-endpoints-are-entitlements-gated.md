# Config value endpoints become entitlements-gated; first access moves to the value's own write

ADR 0035 added self-service `write` on a config's Entitlements, but left `GET`/`PUT`/`DELETE
/config/{configId}` (the config's actual value) admin-only and consulting no Entitlement — a
squatted Entitlements claim controlled nothing yet, and opening the value endpoints was
explicitly deferred to a follow-up ticket. This is that ticket.

We decided `GET` now requires `read` and `PUT`/`DELETE` require `write` on
`EntitlementScope.CONFIGS`, replacing the previous `super-admin`/`data-admin`-only gate (`GET` was
previously wide open, with no gate at all). Privileged callers keep bypassing entitlement checks,
same as everywhere else. First access — self-claiming a fresh `plugin:{pluginId}:{id}` — moves off
`PUT /config/{configId}/entitlements` and onto `PUT /config/{configId}` itself: the config row's
own insert (`INSERT ... ON CONFLICT (id) DO NOTHING`, checked via `RETURNING id` — an empty result
means the row was lost to the conflict; affected-row-count-style signals like `identifiers` are
unreliable here since `id` is a caller-supplied, not DB-generated, primary key) is the atomic
gate, and the caller who wins it is self-granted `write` in the same request transaction.
`PUT /config/{configId}/entitlements`'s own first-access bypass is removed — it now always
requires an existing `write` grant, closing the race ADR 0035 documented instead of leaving two
divergent bootstrap paths open at once.

## Considered options

- **Keep the bootstrap only on the entitlements sub-resource, gate the value endpoints on
  whatever grant already exists**: rejected — a plugin's first attempt to actually write its
  config value would still 403 (no grant exists yet) unless it first called a separate
  entitlements endpoint the frontend never wires into the save flow. Self-service would not work
  end-to-end.
- **Keep both bootstrap paths** (entitlements endpoint and value endpoint): rejected — reintroduces
  the same non-atomic race ADR 0035 already flagged, on the very endpoint this ADR fixes, for no
  added benefit once the value endpoint's atomic path exists.
- **Grant `'everyone'` `write` (not just `read`) on the known system config ids**, for a uniform
  migration grant model: rejected — no caller other than an admin needs to write these today, and
  admins bypass entitlement checks entirely. Granting `write` to `'everyone'` would newly let
  anonymous callers overwrite `theme`/`frontend-logo`/etc., a capability that does not exist today.

## Consequences

- Plugin-id squatting (nothing ties a `plugin:{pluginId}:...` id's `pluginId` segment to the
  caller) stops being inert now that the value endpoints are open to non-admins — a squatter can
  now write real data under a squatted id. Accepted for this ticket: the blast radius stays scoped
  to one plugin's own config namespace and nothing else, and no registry of legitimate plugin ids
  exists to check ownership against (same reasoning ADR 0035 used to reject building one). Revisit
  if squatting is ever observed to cause real harm.
- `ConfigItem` (`openapi.yaml`) is a bare `type: object` — no shape or size constraint of its own,
  only the app-wide `JSON_PAYLOAD_LIMIT` body-size cap — and self-access is now open to any
  authenticated non-admin, not just admins. There is also no limit on how many distinct
  `plugin:{pluginId}:{id}` rows one subject can claim. A logged-in caller can therefore create an
  unbounded number of config rows, each up to `JSON_PAYLOAD_LIMIT` of arbitrary JSON. Accepted for
  this ticket, same reasoning as plugin-id squatting above: revisit (a per-subject row quota, or a
  tighter `ConfigItem` schema) if abuse is observed.
- `ConfigService.deleteConfig`'s soft delete still does not clear a config id's Entitlements grant,
  and — as a side effect of using `ON CONFLICT (id)` for the bootstrap check — a soft-deleted row
  still blocks a new first-access claim on the same id (the row's primary key still exists). A
  deleted config id therefore stays locked to whoever already holds `write`, or requires an admin,
  unchanged from before this ADR.
- `GET /config/{configId}/entitlements` keeps its existing lack of a first-access bypass (ADR
  0035) — unaffected by this change.
