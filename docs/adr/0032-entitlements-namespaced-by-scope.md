# Entitlements are namespaced by scope; the external entitlements endpoint is wrapped, not changed

Entitlements storage and the `GET /entitlements` response move from a flat map keyed directly by dataset slug (`{"b": ["preview", "download"]}`) to a map namespaced by scope (`{"datasets": {"b": [...]}, "configs": {"dashboard_1": [...]}}`), so a new "configs" scope can exist without colliding with dataset slugs in the same top-level namespace. This is a breaking change to a stored data shape and an API response shape already in production use — we take the break now, as a hard cutover shipped in lockstep across backend and frontend, rather than carry a dual-read/versioned compatibility layer, because only two consumers exist today (the frontend app and the external `ENTITLEMENTS_ENDPOINT` service) and that cost only grows the longer the flat shape is load-bearing elsewhere.

The external `ENTITLEMENTS_ENDPOINT` service is not required to change: it keeps returning its existing flat `{slug: capabilities}` shape, and `EntitlementService` wraps that response under `datasets` internally before merging it with local (now-nested) rows. This avoids a cross-team dependency blocking this ticket.

## Considered options

- **Dual-read compatibility window** (serve old flat shape unless `?scope=` is passed): rejected — adds a temporary branch that has to be remembered and removed later, for a migration that ships BE+FE together anyway.
- **Change the external endpoint's contract to the nested shape too**: rejected — would make this ticket depend on another team's rollout for no benefit, since wrapping the flat response locally is a small, contained cost.
- **A real `Config`/`Dashboard` backend entity to validate `configs` keys against**: rejected — no such entity exists anywhere in the codebase today; inventing one is a separate, larger feature. `configs` keys stay freeform strings, same permissiveness as dataset slugs today. The `scope` name itself (`datasets` / `configs`) is validated against a fixed enum — the one guardrail this ticket adds. Capability values are validated only against the existing `Capability` enum (extended with `READ`/`WRITE`, not split per scope), so there is no type-level restriction on which capability values are valid within which scope — that was considered (separate `ActionCapability`/`ACLCapability` types) and rejected in favor of keeping a single shared enum.

## Consequences

- The GIN index on `entitlements.data` (`USING GIN (data)`), which supports the current top-level `data ?| array[...]` slug lookup, no longer serves dataset-slug queries once slugs move under `data->'datasets'`. The migration must replace it with an expression index on `(data->'datasets')`.
- `GET /entitlements` requires a mandatory `scope` query param (`datasets` | `configs`); there is no "all scopes" response, since no current consumer needs one.
- `GET`/`PUT /datasets/{datasetId}/entitlements` are unaffected — they stay scoped to one dataset and keep returning a flat `Record<Capability[]>`.
- Nothing stops a `configs` entry from being assigned `download`, or a `datasets` entry from being assigned `read`/`write` — accepted as a deliberate trade-off in favor of a single shared `Capability` enum.
