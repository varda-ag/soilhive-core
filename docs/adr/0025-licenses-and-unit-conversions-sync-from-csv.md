# Vocabularies tables data sync from CSV, not just seed once via migration

`licenses`, `unit_conversions`, `soil_properties`, `soil_property_categories` and `procedures` were
seeded once from hand/tool-generated SQL insert files (`backend/src/migrations/data/*.sql`), run
only by `1775600000000-CreateSchema.ts` on a fresh schema. The CSVs in `backend/docs/data-model/`
are the actual authored source of truth — a domain expert edits `6-license_options.csv` or
`5b-conversion-rules-table.csv`, and until now that change had no path into a running database
short of hand-writing SQL. `syncVocabularies()` (`backend/src/scripts/syncVocabularies.ts`) closes
that gap for the two structurally simple tables: it upserts by natural key (`licenses.name`;
`unit_conversions.(property_id, original_unit_of_measurement)`, with `property_id` resolved from
`soil_properties.property_acronym = CSV.subproperty_code`, the same join the original seed SQL
used), so a row's `id`/`slug` never changes — both are referenced by FK from datasets/observations,
and slugs feed `slug_history`.

It runs automatically at every boot (`app.ts`, after `initializeSchema`, wrapped so a failure is
logged rather than blocking startup), because the CSVs only change via a new image — a deploy is
the only event that can make this data stale, the same premise ADR 0009's automatic `refreshDaiStats`
hooks act on, just with "boot" standing in for "the underlying data changed". It is also exposed as
`--sync-vocabularies` (`utils/cli.ts`, plus `--dry-run` to report counts with no writes) for an
on-demand re-run without a redeploy, mirroring `--refresh-dai-stats`.

A row present in the DB but no longer in the CSV is never deleted automatically — only logged as an
orphan. Removing a vocabulary term is a decision a human should make deliberately (the CSV having
temporarily dropped a row, or an export being incomplete, must not silently delete live reference
data), not an automatic consequence of a sync running.

`soil_properties` and `procedures` are deliberately out of scope here. Their source CSVs
(`4c-soil-property-vocabulary-table.csv`, `4e-analytical-methodology-table.csv`) don't map row-for-row
onto their tables: a `soil_properties` row is hierarchical (each CSV row encodes a parent `Property`
and a child `subproperty` at once, via `parent_property_id`/`property_level`), and a `procedures` row
is a composite of seven independent `vocabulary`-table categories plus a `technique` enum that isn't
a CSV column at all. Syncing those needs that mapping worked out deliberately, not inferred from this
change.

## Consequences

- The vocabulary CSVs live in `backend/docs/data-model/`, not the repo-root `docs/data-model/`,
  because the Docker image is built with `backend/` as its context and could not otherwise include
  them (`Dockerfile`'s `COPY docs/data-model ./docs/data-model`). The narrative docs under
  `docs/data-model/` link out to them by relative path instead of holding a duplicate copy.
- `licenses.full_name` is set only on first insert, never overwritten on update: several existing
  rows carry a more precise official name than the CSV's own `"<name> — <full name>"` column (e.g.
  "Attribution 3.0 Unported" vs. the CSV's "Attribution"), and a sync must not regress that.
- A `unit_conversions` row whose `subproperty_code` has no matching `soil_properties.property_acronym`
  is skipped and logged, not fatal — this can sync legitimately before `soil_properties` itself is
  ever CSV-synced.
- Adds `csv-parse` as a dependency: the CSVs' quoted fields (license descriptions, conversion notes)
  contain embedded commas that a hand-rolled splitter would corrupt.
- Every boot now does a handful of upsert/select statements per vocabulary row (licenses: ~11 rows;
  unit_conversions: on the order of hundreds) before the server starts accepting traffic. Multiple
  replicas booting the same image concurrently upsert the same rows redundantly but safely
  (`ON CONFLICT DO UPDATE` serializes at the DB); no coordination between them exists or is needed.

## Considered options

- **Expose authenticated upsert endpoints and drive the sync from GitHub Actions (or elsewhere in
  CI) instead of from the app itself** — a CI job would check out the repo (getting the CSVs for
  free, unlike the rejected direct-to-database option above) and call the API over HTTP, which sidesteps
  the direct-database-reachability problem since CI only needs to reach the public API, not the
  database port. Rejected on both a design and an operational ground. Operationally, it trades
  file-reading complexity for a new write-surface on the API (endpoints capable of mutating
  `licenses`/`unit_conversions`, a CI-held credential per target environment, and explicit
  deploy-then-sync sequencing to preserve the schema/data alignment the boot hook currently gets for
  free from running inside the same deploy). By design, we want a deliberately separate path for
  external contributors — a domain expert proposes a vocabulary change as a CSV edit in a pull
  request, reviewed like any other change, with no path that lets an external contributor (or
  anything acting on their behalf) call an authenticated write endpoint directly.
- **CLI flag only, no automatic boot hook** — this was the original shape of the feature. Rejected
  once framed against ADR 0009's `refreshDaiStats` hooks: a manual-only flag relies on someone
  remembering to run it after a deploy that changed the CSV, which is exactly the class of problem
  ("the CSV and the DB drift apart") the sync exists to close.
- **Trigger the sync from outside the app** — a docker-compose one-off command, or a GitHub Actions
  workflow that checks out the repo (getting the CSVs for free) and connects to the target database
  directly. Rejected: no existing pipeline in this repo gives CI network access to a deployed
  database, standing one up was a disproportionate answer to a CSV-visibility problem, and once the
  data is baked into the image anyway, having the app sync itself on boot needs no new infrastructure
  at all.
- **Widen the Docker build context to the repo root** so `docs/data-model/` could be `COPY`'d as-is —
  rejected. It would touch `docker-compose.yml`, the CI workflow, and every `COPY` path in both
  Dockerfiles, for a benefit (avoiding a four-file relocation) far smaller than that blast radius.
- **Soft-delete orphaned rows** (a CSV row that disappeared marks the DB row `deleted_at`) — rejected.
  A CSV that is ever incomplete or exported wrong would silently take live, FK-referenced vocabulary
  out from under datasets that use it. Logging and leaving the row alone costs nothing but requires a
  human to notice the warning.
- **Refuse to sync when any row would be orphaned** — rejected. It turns a routine, low-risk sync into
  a blocker on every run where the CSV simply hasn't caught up with every historical row yet, for a
  problem (an unwanted row lingering) that isn't actually urgent.