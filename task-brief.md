# Task Brief: SP-5633 — Open config entitlements to authenticated users, gated writes

## Summary
`GET`/`PUT /config/{configId}/entitlements` currently require an admin token
(`super-admin` or `data-admin`). This changes both endpoints to accept any
authenticated user, each gated by its own domain-level rule (revised after
initial implementation — see Subtask 5).

`PUT` gets a new domain-level authorization rule: a non-admin caller
may write a config's entitlements only if nobody holds any entitlement for
that config yet (first access / bootstrap), or if the caller already holds
the `WRITE` capability for that config. Admins keep bypassing this check
entirely, consistent with the existing `isPrivilegedCaller` bypass used
throughout the entitlements system — except for a set of reserved config
keys (`theme`, `frontend-logo`, `ingestion-status`, `vocabulary-csv-hashes`)
whose entitlements nobody may ever write, not even an admin.

`GET` returns the full multi-subject grants map (every subject's id and
capabilities for that config) — a more sensitive payload than a single
capability check, so it is gated too: a privileged caller, or a caller who
already holds `READ` or `WRITE` on the config, may read it; everyone else
gets `403`. No "first access" bypass here — nobody holds READ/WRITE on a
config nobody has ever been granted anything on, so the same check covers it.

Out of scope: `/datasets/{datasetId}/entitlements`
(stays admin-only) and making `GET /config`/`GET /configs` honor entitlements
(separate ticket).

## Ticket
SP-5633

## Git branch
feature/sp-5633-config-entitlements (already checked out)

## Codebase context
- Routing is OpenAPI-driven (`backend/src/openapi.yaml`). `security: - bearerAuth: []`
  means "any authenticated token, no scope required" — this is the pattern
  already used by `GET /entitlements` (line ~16). The config entitlements
  paths currently use `security: - bearerAuth: [super-admin, data-admin]`
  (lines ~853 and ~879).
- `x-entitlements-required: true` on an operation makes `authMiddleware`
  (`backend/src/middlewares/auth.ts`) populate `req.customData.entitlements`
  via `EntitlementService.getUserEntitlements` before the controller runs.
  The `PUT` operation does not have this flag today (it never needed
  entitlements, only an admin scope) — it must be added, or
  `req.customData.entitlements.configs` will be empty in the controller.
- `EntitlementService.isPrivilegedCaller` (`backend/src/utils/auth.ts`) is the
  single "admin bypass" predicate used everywhere (internal-request,
  data-admin, super-admin). New write-gate logic must reuse it, not
  re-derive privilege.
- `EntitlementService.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, key)`
  is the existing method backing `GET /config/{configId}/entitlements` —
  reuse it verbatim to detect "first access": an empty returned map means no
  subject (including `everyone`) holds any grant for that config yet.
- `EntitlementService.enforceEntitlements` is the existing capability-check
  pattern (dataset-scoped) but does not fit here unmodified: it has no
  "first access" bypass and always throws when the key is absent from the
  caller's entitlements. Write a new, separate method rather than bending
  this one — do not add a first-access branch to `enforceEntitlements`
  itself, since that method's dataset-visibility filtering logic is unrelated
  and shared by other callers.
- `Capability.WRITE = 'write'` already exists in `backend/src/types/enums.ts` —
  no new capability needed.
- `configs` scope keys are freeform ids (not entity-backed), so no
  slug-history resolution applies — a plain key match against
  `requestData.entitlements.configs[key]` is correct (see
  `ENTITY_BACKED_SCOPES` in `EntitlementService.ts`, which deliberately
  excludes `CONFIGS`).
- `ErrorResponse` + `StatusCodes.FORBIDDEN` (both already imported in
  `EntitlementService.ts`) is the existing convention for a 403 from a
  service method; the OpenAPI-validator error middleware turns this into the
  HTTP response.
- Test helpers (`backend/tests/helper.ts`): `getDataAdminToken()` (async,
  admin, bypasses everything — vacuous for entitlement tests) vs
  `getUserToken(sub, email)` (sync, non-admin, `scope: 'user'` — required to
  exercise the new gate).
- No DB schema or migration changes required.

## Subtasks

### Subtask 1 — OpenAPI spec: open up `/config/{configId}/entitlements`
**What to implement:** Change `security` on both `GET` and `PUT
/config/{configId}/entitlements` from `bearerAuth: [super-admin, data-admin]`
to `bearerAuth: []`. Add `x-entitlements-required: true` to the `PUT`
operation. Add a `403` response (`$ref: '#/components/responses/Forbidden'`)
to `PUT`'s responses.
**Files:** `backend/src/openapi.yaml`
**Tests:**
- Happy path: a non-admin authenticated token can call `GET` and gets `200`.
- Edge case: a request with no token still gets `401` on both `GET` and `PUT`.

### Subtask 2 — Authorization gate for config writes in `EntitlementService`
**What to implement:** Add a method, e.g.
`assertCanWriteConfigEntitlement(requestData: RequestData, key: string): Promise<void>`:
1. Reject with `403` if `key` is one of the reserved config keys (see below)
   — checked before the privileged-caller bypass, since nobody, admin
   included, may write entitlements for these.
2. Return immediately if `isPrivilegedCaller(requestData.token)`.
3. Call `getEntityEntitlements(requestData, EntitlementScope.CONFIGS, key)`;
   if the result has no keys, return (first access — nobody has any grant
   for this config yet).
4. Otherwise, read `requestData.entitlements[EntitlementScope.CONFIGS]?.[key]`;
   if it does not include `Capability.WRITE`, throw
   `new ErrorResponse(\`User does not have write entitlement for config ${key}\`, StatusCodes.FORBIDDEN)`.

**Reserved config keys** (added after the initial brief, per user clarification,
then revised — see below): `theme`, `frontend-logo`, `ingestion-status`,
`vocabulary-csv-hashes`. Their entitlements can never be written by anyone,
including admins/privileged callers — the reserved-key check runs before the
`isPrivilegedCaller` bypass, deliberately unlike every other rule in this
gate. Implemented as a `RESERVED_CONFIG_KEYS` set in `EntitlementService.ts`.

**Files:** `backend/src/services/EntitlementService.ts`,
`backend/tests/services/EntitlementService.test.ts`
**Tests:**
- Happy path: non-privileged caller allowed when the config has zero
  existing grants (first access).
- Edge case: non-privileged caller without `WRITE` rejected once the config
  already has any grant (for any subject, not just this caller); also cover
  a privileged caller bypassing regardless, and a caller holding `WRITE`
  succeeding.
- Edge case: non-privileged caller rejected (`403`) for each reserved config
  key even on first access; a privileged caller is rejected too — nobody
  bypasses the reserved-key block.

### Subtask 3 — Wire the gate into the controller
**What to implement (revised after initial implementation):** Rather than
having the controller call `assertCanWriteConfigEntitlement` and
`setEntityEntitlements` as two separate steps, `EntitlementService` now
exposes a single `setConfigEntitlement(requestData, key, entitlements)`
method that composes them internally (gate first, then write). This keeps
the "check before write" invariant inside the service, so any future caller
of the CONFIGS-scoped writer can't reach it without the gate running first.
The controller's `setConfigEntitlement` is now a one-line call to the
service method of the same name. Leave `getConfigEntitlements`,
`getDatasetEntitlements`, and `setDatasetEntitlement` unchanged.
**Files:** `backend/src/services/EntitlementService.ts`,
`backend/src/controllers/entitlements.ts`,
`backend/tests/services/EntitlementService.test.ts`
**Tests:**
- Happy path: route-level `PUT` succeeds (`200`) for a non-admin user on
  first access.
- Edge case: route-level `PUT` returns `403` for a non-admin user lacking
  `WRITE` once the config already has grants (e.g. seeded via the existing
  `everyone` entitlement pattern in the test file).
- Service-level: `setConfigEntitlement` writes when the gate passes, and
  rejects without writing (no side effect) when the gate fails — including
  for a reserved config key with a privileged caller.

### Subtask 4 — Route-level coverage for open `GET`
**What to implement:** No production code — extend
`tests/routes/entitlements.test.ts` to lock in the new access rules
end-to-end, using `getUserToken` for the non-admin cases.
**Files:** `backend/tests/routes/entitlements.test.ts`
**Tests:**
- Edge case: non-admin user holding `WRITE` on a config can `PUT` it even
  though grants already exist for that config (regression guard,
  complements subtask 3's rejection case).
- Edge case: non-admin user gets `403` on route-level `PUT` for a reserved
  config key (e.g. `theme`), even on first access; an admin user gets `403`
  on the same reserved key too.

  (The GET happy-path test originally planned here — non-admin gets `200`
  unconditionally — was superseded by Subtask 5, which gates GET too.)

### Subtask 5 — Authorization gate for config reads (added after initial implementation)
**What to implement:** Add `assertCanReadConfigEntitlement(requestData: RequestData, key: string): Promise<void>`
in `EntitlementService.ts`, next to the write gate:
1. Return immediately if `isPrivilegedCaller(requestData.token)`.
2. Otherwise read `requestData.entitlements[EntitlementScope.CONFIGS]?.[key]`;
   if it includes neither `Capability.READ` nor `Capability.WRITE`, throw
   `new ErrorResponse(\`User does not have read entitlement for config ${key}\`, StatusCodes.FORBIDDEN)`.

No "first access" bypass, unlike the write gate: a non-privileged caller on
a config nobody has ever been granted anything on holds neither capability
either, so the same check rejects it without a separate branch.

Also add `getConfigEntitlement(requestData, key)`, composing the gate with
`getEntityEntitlements(..., CONFIGS, key)`, mirroring `setConfigEntitlement`
— same reasoning: keep "check before read" inside the service so no future
caller of the CONFIGS-scoped reader can skip it. The controller's
`getConfigEntitlements` becomes a one-line call to this method.

OpenAPI: add `x-entitlements-required: true` and a `403`
(`$ref: '#/components/responses/Forbidden'`) response to `GET`, same as
`PUT` already has.

**Files:** `backend/src/openapi.yaml`, `backend/src/services/EntitlementService.ts`,
`backend/src/controllers/entitlements.ts`, `backend/tests/services/EntitlementService.test.ts`,
`backend/tests/routes/entitlements.test.ts`
**Tests:**
- Happy path: non-privileged caller holding `READ` or `WRITE` on the config
  is allowed; privileged caller allowed regardless of capability.
- Edge case: non-privileged caller with no capability (or an unrelated one)
  for the config is rejected (`403`) — including on first access (nobody
  holds any grant yet).
- Route-level: non-admin gets `403` with no capability, `200` holding
  `READ`, `200` holding `WRITE`; admin (privileged) still gets `200`
  unconditionally (existing test, unaffected).

## Test plan
Steps for `/verify` to execute after implementation. All calls are backend
(no frontend changes in this ticket).

1. **Start infra + server:** `docker compose -f docker-compose-dev.yml up -d`
   then `cd backend && npm run dev`.
2. **Obtain tokens:** one admin token (per the project's configured auth
   mode — ask the user which is enabled) and one non-admin token signed the
   same way the test helper does (`scope: 'user'`, arbitrary `sub`/`email`).
3. **First-access PUT as non-admin:**
   `curl -X PUT localhost:4001/config/test_config_x/entitlements -H "Authorization: Bearer <non-admin>" -d '{"someone@example.com":["write"]}'`
   on a `configId` with no prior entitlements — expect `200`.
4. **Locked-out PUT as non-admin without WRITE:** repeat step 3's `PUT` for
   the *same* `configId` from a *different* non-admin subject with no
   `write` grant on it — expect `403`.
5. **Authorized PUT as WRITE holder:** as the subject granted `write` in
   step 3, `PUT` again on the same `configId` — expect `200`.
6. **Gated GET, admin:** `curl localhost:4001/config/test_config_x/entitlements -H "Authorization: Bearer <admin>"` — expect `200` (privileged bypass).
6b. **Gated GET, WRITE holder:** as the subject granted `write` in step 3, `GET`
   the same `configId` — expect `200`, body includes that subject's own grant.
6c. **Gated GET, no capability:** `GET` the same `configId` as a *third*
   non-admin subject with no grant on it at all — expect `403`.
7. **Unauthenticated:** repeat steps 3 and 6 with no `Authorization` header —
   expect `401` on both.
8. **DB check:** `psql -h localhost -U dbuser -d soilhive -c "SELECT id, data->'configs' FROM soilhive.entitlements WHERE data->'configs' ? 'test_config_x';"`
   to confirm the persisted grants match what was `PUT`.
9. Run the full backend suite: `npm test` (covers subtasks 1–5's automated
   tests plus regression on `/datasets/{datasetId}/entitlements`, which must
   remain admin-only and unaffected).
