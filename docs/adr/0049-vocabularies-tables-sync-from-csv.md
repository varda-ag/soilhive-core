# Vocabularies tables data sync from CSV, not just seed once via migration

`licenses`, `unit_conversions`, `soil_properties`, `soil_property_categories` and `procedures` were
seeded once from hand/tool-generated SQL insert files (`backend/src/migrations/data/*.sql`), run
only by `1775600000000-CreateSchema.ts` on a fresh schema. The CSVs in `backend/docs/data-model/`
are the actual authored source of truth — a domain expert edits `6-license_options.csv` or
`5b-conversion-rules-table.csv`, and until now that change had no path into a running database
short of hand-writing SQL. `syncVocabularies()` (`backend/src/scripts/syncVocabularies.ts`) closes
that gap, upserting each table by its own natural key so `id`/`slug` of an existing row never
changes — every one of these is referenced by FK from datasets/observations/each other, and slugs
feed `slug_history`:

- `licenses` by `name`.
- `soil_property_categories` by `category_name` (`4f-soil-property-category-table.csv`).
- `soil_properties` by `property_name` (`4c-soil-property-vocabulary-table.csv`), with
  `category_id` resolved from `soil_property_categories.category_name = CSV.Classification`. Each
  CSV row carries a level-1 `Property` and, when present, a level-2 `subproperty` that narrows it —
  "Acid Saturation" (level 1) repeats on every row naming one of its subpropertes, so the parent is
  upserted once per row it appears on (idempotent, if redundant) without `description`/
  `standard_unit`, since those columns describe *this row's* subproperty, not the shared parent. A
  row naming only one of `subproperty`/`subproperty_code` is invalid and is skipped with a warning
  rather than guessed at.
- `vocabulary` by `(category, name)` (`4e-analytical-methodology-table.csv`) — not the `procedures`
  table itself (see below). Each of the CSV's seven columns (`sample_pretreatment`,
  `laboratory_method`, ...) is its own `VocabularyType` category, matching the enum's values
  exactly; each non-empty cell under it is one term of that category, deduplicated across the whole
  file before upserting, since the same term legitimately repeats across many rows.
- `unit_conversions` by `(property_id, original_unit_of_measurement)`, with `property_id` resolved
  from `soil_properties.property_acronym = CSV.subproperty_code`, the same join the original seed
  SQL used (`5b-conversion-rules-table.csv`).
- `soil_properties.classes` (`4g-soil-property-classes-table.csv`): the class codes of categorical
  properties, one CSV row per class (`property_code`, `code`, `label`, optional `;`-separated
  `aliases`), written as one jsonb object per property — `{"8": {"label": "Silty Loam", "aliases":
  ["Silt Loam"]}}` — matched to its property by `property_acronym`, the same way unit conversions
  are. Not a table of its own: classes are only ever read whole, with their property (labelling
  `value` in `/soil-data` and the dataset preview, resolving codes and labels during cleaning,
  `CLASSES` metadata and a legend in raster exports), so a jsonb column on `soil_properties` costs
  no join. A property's rows are validated as a set before anything is written: codes must be
  integers and unique, and labels and aliases must be unique per property once normalized (case,
  surrounding and repeated whitespace ignored) and must not be numbers, so that a raw value in a
  data file resolves to exactly one code and is never mistaken for one. A property whose rows fail
  keeps the classes it had, with the problems logged; the other properties in the file still sync.

It runs automatically at every boot (`app.ts`, after `initializeSchema`, wrapped so a failure is
logged rather than blocking startup), because the CSVs only change via a new image — a deploy is
the only event that can make this data stale, the same premise ADR 0009's automatic `refreshDaiStats`
hooks act on, just with "boot" standing in for "the underlying data changed". It is also exposed as
`--sync-vocabularies` (`utils/cli.ts`, plus `--dry-run` to report counts with no writes) for an
on-demand re-run without a redeploy, mirroring `--refresh-dai-stats`.

A row present in the DB but no longer in the CSV is never deleted automatically — only logged as an
orphan. Removing a vocabulary term is a decision a human should make deliberately (the CSV having
temporarily dropped a row, or an export being incomplete, must not silently delete live reference
data), not an automatic consequence of a sync running. The same holds for classes: a property that
has classes but no longer appears in the classes CSV keeps them, and is logged.

Each file is skipped entirely — no per-row queries at all, not even the orphan check — when its
SHA-256 content hash matches the one stored from the last successful sync. The hash lives in
`jsonstorage` (the same generic keyed-config table `ConfigService` already uses elsewhere, e.g. for
the frontend logo), keyed per file so a change to one CSV doesn't force a re-check of the other.
Since almost every boot runs against the exact same image as the one before, this is the difference
between a couple of hundred upsert/select statements and six hash comparisons on a typical boot. A
dry run makes the identical skip decision (so it previews truthfully) but never persists the new
hash, matching its no-writes contract.

The classes file is the one exception to "store the hash once the file has synced": its hash is not
stored while any of its rows names a property that doesn't exist yet. The classes CSV itself won't
change when that property is later added to `4c-soil-property-vocabulary-table.csv`, so a stored
hash would skip the file on every boot after, and the property would never get its classes. Leaving
it unstored costs one re-check of a small file per boot until the property exists.

The initial-schema migration (`1775600000000-CreateSchema.ts`) no longer runs any of the five
`*_data_insert.sql` files it used to seed on a fresh schema. `syncVocabularies()` — called from
`app.ts` immediately after the migration completes, the same as any other boot — now populates
`licenses`, `soil_property_categories`, `soil_properties` and `unit_conversions` instead.

`0_procedures_data_insert.sql` was more than a `vocabulary` seed: it staged a hand-curated dataset
that, unlike the public CSV, *did* carry a `technique` value (`lab procedure` | `spectral` |
`calculated`) per combination, and inserted actual `procedures` rows from it. A fresh database no
longer gets that pre-seeded baseline — every `procedures` row now comes into existence exactly when
`ProcedureService.createProcedure` is called for a combination someone actually uses, same as any
new combination always did, but without the head start the old seed gave a fresh install. The five
generated SQL files are left on disk for now rather than deleted alongside this change.

The `procedures` table itself stays out of scope for the same reason: only the `vocabulary` terms a
procedure is built from are synced here, since assembling the composite rows themselves needs a
`technique` this sync has no source for.

While implementing the above, two pre-existing bugs surfaced that would have silently broken it:
`soil_property_categories`'s upsert targeted a conflict column (`name`) that doesn't exist on that
table (it's `category_name`), so no category could ever actually be inserted; and
`VocabularyEntity`'s `@Index(['category', 'name'], { unique: true, where: 'deleted_at IS NULL' })`
had never been created in the database at all (only `(id, category)` exists) — an
`ON CONFLICT (category, name)` upsert would have failed outright with no matching constraint. The
first is fixed in `syncCategories` itself; the second is fixed by a new index folded into
`1785800000000-UnitConversionSlugTriggerColumns.ts` (an unreleased migration at the time, so
amended in place rather than adding a fourth migration this same change already needed).

## Consequences

- The vocabulary CSVs live in `backend/docs/data-model/`, not the repo-root `docs/data-model/`,
  because the Docker image is built with `backend/` as its context and could not otherwise include
  them (`Dockerfile`'s `COPY docs/data-model ./docs/data-model`). The narrative docs under
  `docs/data-model/` link out to them by relative path instead of holding a duplicate copy.
- A `unit_conversions` or classes row whose property code has no matching
  `soil_properties.property_acronym`, or a `soil_properties` row whose `Classification` has no
  matching `soil_property_categories.category_name`, is skipped and logged, not fatal — either can
  sync legitimately before its dependency has caught up, since the six syncs run in a fixed order
  (licenses → categories → soil properties → vocabulary terms → unit conversions → classes) within
  one call but each tolerates the others being incomplete. Only the classes sync retries such rows on
  a later boot without a CSV change (see above); a unit conversion skipped this way waits for its own
  CSV to change.
- Classes are reference data the rest of the system acts on, not just labels: once a property has
  classes, its values are cleaned as class codes (a value that isn't one is reported `unknown_class`,
  and a label or alias in a data file is resolved to its code), and `POST /soil-data` rejects a value
  that isn't one of them. Adding classes to a property that already has loaded data does not
  re-validate that data.
- Adds `csv-parse` as a dependency: the CSVs' quoted fields (license descriptions, conversion notes)
  contain embedded commas that a hand-rolled splitter would corrupt.
- A boot against unchanged CSVs costs six hash comparisons; a boot where any changed costs one
  upsert statement per row of that file (licenses: ~11 rows; unit_conversions: on the order of
  hundreds), or for the classes file one update per property, before the server starts accepting
  traffic.
- `syncVocabularies()` acquires a non-blocking Postgres advisory lock (`pg_try_advisory_lock` on a
  fixed key, via a `queryRunner` pinned to one connection for the lock's session-scoped lifetime)
  before doing any work. A replica that doesn't get the lock logs that another one is already
  syncing and returns immediately. This isn't needed for correctness — every upsert is
  independently idempotent, so two replicas racing past the hash check and both syncing the same
  file can't corrupt anything — it exists to stop a simultaneous rolling restart of many replicas
  from all redoing the same couple hundred upserts and hash writes at once.
- `syncSoilProperties` and `syncUnitConversions` each resolve a foreign key by natural key
  (`category_id` from `Classification`, `property_id` from `subproperty_code`). Both load their
  small, read-only reference table into an in-memory `Map` once per call rather than querying it
  per CSV row — categories and properties don't change mid-sync, and the table is small enough to
  hold outright, so this trades one query for what used to be one query per row.
- `vocabulary` rows are keyed by `(category, name)`, not by any single CSV row: the same term can
  legitimately be the *n*th repeat of the same cell value across many analytical-methodology rows,
  so orphan detection for this file means "no CSV cell anywhere still produces this
  (category, name)", not "no CSV row still matches".

## Considered options

- **Also assemble `procedures` rows from the seven synced `vocabulary` terms, treating one CSV row
  as one composite procedure** — rejected. `ProcedureService.createProcedure` already gets-or-creates
  a `procedures` row for *any* combination of vocabulary term names plus a caller-supplied
  `technique`, resolving each term by `(name, category)` against `vocabulary` (throwing if it isn't
  there yet — which is exactly why `syncProcedures` populating `vocabulary` is the useful part). The
  public CSV has no `technique` column at all — the retired seed file got its `technique` values
  from a separate, hand-curated dataset, not from anything `syncProcedures` reads — so assembling
  `procedures` here would mean inventing a `technique` for each combination rather than deriving
  one. A CSV row was never a real constraint on which combinations are valid to begin with either:
  each column is an independent list of terms in that category, not a set of rows meant to be used
  together. Letting the application's own get-or-create path create exactly the combinations a user
  actually selects avoids both problems.
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
- **Wrap each table's upserts in one transaction instead of auto-committing every row** — rejected.
  Postgres aborts the whole transaction on the first statement error, not just that statement, so a
  single malformed CSV row would roll back every row that had already succeeded before it in that
  table's sync — the opposite of the per-row `try`/`catch` isolation this sync relies on to skip a
  bad row and keep going. Recovering that isolation inside one transaction would need a `SAVEPOINT`
  around every row, reintroducing roughly the per-row overhead being avoided. The advisory lock
  above already removes the actual problem (concurrent replicas contending over the same rows)
  batching into a transaction would have been reached for.
- **Keep class codes in `unit_conversions`** — in `conversion_formula` as JSON text or a `CASE`
  expression, or in `metadata` on a `CATEGORY_MAPPING` row whose original unit equals the
  property's standard unit — rejected. `conversion_formula` is pasted into the cleaning SQL and
  parsed as a raster scale factor, so a non-formula there breaks both. And classes describe the
  property's standard codes, which observations are stored in, not a conversion from a source unit:
  observations don't record which conversion produced them, so a lookup would have to depend on two
  free-text unit strings matching exactly, which `5b-conversion-rules-table.csv` already didn't for
  USDA texture.
- **A separate `soil_property_classes` table** — not chosen for now. It would let the database
  enforce unique codes and make querying by class a plain join, but every current reader takes a
  property's classes whole; the validation it would provide is done by the sync instead. Moving
  the jsonb into a table later remains straightforward if classes need columns of their own
  (colours, translations) or queries by class.
- **Bulk multi-row `INSERT ... VALUES (...), (...) ON CONFLICT ... DO UPDATE`** — rejected for the
  same error-isolation reason, and `syncSoilProperties` specifically has a row-to-row dependency (a
  subproperty's `INSERT` needs the `id` its parent row's `INSERT` just returned), which doesn't
  bulk without restructuring into a two-phase parents-then-children batch. Row counts here are in
  the low hundreds across all six files, and this only runs at all on the rare boot where a CSV
  actually changed — not enough round-trip cost to justify trading the resilience away for.