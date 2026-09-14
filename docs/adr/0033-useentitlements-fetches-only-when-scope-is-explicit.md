# `useEntitlements` fetches only when a scope is explicitly passed

`useEntitlements(scope?: EntitlementScope)` has no default for `scope`, and only calls `GET /entitlements` when one is passed. Of the hook's 10 call sites, only 3 (`AvailabilityContext`, `DatasetsSidebar`, `DatasetsListItem`) ever check an entity-scoped capability (`Capability.DOWNLOAD`/`PREVIEW`); the other 7 only check the static, client-side `ENTITLEMENT_MATRIX` (role-based actions like `ADMIN_PORTAL_ACCESS`) and never need the fetched map. Defaulting `scope` to `'datasets'` — the original plan, chosen so no call site would need touching — would have kept firing an unnecessary authenticated network request from every one of those 7 matrix-only call sites on every mount. Making the fetch explicit-only turns that into a genuine no-op for them, at the cost of requiring the 3 entity-scoped call sites to pass `EntitlementScope.DATASETS` explicitly instead of relying on a default.

Calling an entity-scoped action (`Capability.DOWNLOAD`/`PREVIEW`) without having passed a scope throws immediately (same pattern as the hook's existing "requires an entityId" check), rather than silently resolving every check to `false`.

## Considered options

- **Default `scope` to `'datasets'`** (the ticket's original plan): rejected — simplest, zero call-site changes, but every matrix-only consumer keeps firing an unneeded `GET /entitlements`.
- **A separate, additive `useEntitlementMatrix()` hook** for matrix-only consumers: rejected — solves the same waste without touching the 3 entity-scoped call sites, but leaves two hooks/two mental models for one concept, and still requires migrating the 7 matrix-only call sites to see any benefit — the same amount of churn as updating the 3 entity-scoped ones instead.

## Consequences

- The 3 entity-scoped call sites must always pass `EntitlementScope.DATASETS` (or a future entity-backed scope) explicitly; there is no implicit default to fall back on.
- A future entity-scoped consumer that forgets to pass `scope` gets an immediate thrown error rather than a silently-always-false check.
