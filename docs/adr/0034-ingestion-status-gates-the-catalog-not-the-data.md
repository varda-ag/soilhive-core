# Ingestion Status gates the catalog, not the data

`GET /datasets` and `GET /datasets/{id}` now return only `PUBLISHED` datasets to a caller without
the `data-admin`, `super-admin` or `internal-request` scope, closing a gap in which an anonymous
caller could enumerate every dataset mid-ingest. We deliberately did **not** extend the same
predicate to `GET /soil-data`: **Published** means *listed*, not *released*, so an unpublished
dataset's observations remain readable by anyone holding its slug, gated by Visibility and
Entitlement exactly as before.

## Considered options

- **Make it a security boundary** — also add `status = 'PUBLISHED'` to `/soil-data`'s
  `target_dataset` CTE. Rejected for now, not on principle: it would make Ingestion Status a third
  access axis alongside Visibility and Entitlement, which the domain model deliberately keeps to
  two, and `/soil-data`'s dataset predicates are guarded by tests asserting byte-identical SQL
  (`SoilDataStorage.test.ts`, `SoilDataStorageCount.test.ts`). That is a separate change with its
  own blast radius and deserves its own ticket rather than arriving under a catalog fix.
- **403 instead of 404 on the single read** — rejected. A 403 asserts "this exists and you may not
  have it", which is a statement about access. Status is a catalog attribute, so the honest answer
  is that the dataset is absent from the catalog.

## Consequences

- **`/soil-data` is now the only dataset path without a status predicate, and it looks like an
  oversight.** It is not. `status = 'PUBLISHED'` is pinned in six places across `SoilDataStorage`
  and `DaiStats`; its absence in `buildRawSoilQuery` is this decision. Do not "fix" it without
  reopening this ADR.
- **Unpublishing is not a containment measure.** A public dataset withdrawn from `PUBLISHED`
  because its data is wrong stays fully readable to anyone who already has the slug. Correct the
  data or set the dataset to `private`.
- **The status filter made `DatasetService.getDataset` privilege-sensitive**, and that method is
  also how the bulk-load, raster-load, bulk-delete and export processors reach their dataset —
  always one that is not `PUBLISHED`. Those processors therefore now inherit the submitter's
  `isDataAdmin`/`isSuperAdmin` from the job payload (as the export and soil-statistics processors
  already did), and `JobService.createJob` restricts those queues to privileged submitters so the
  inheritance always yields one. Without both halves, a load would die on a 404 in a worker log.
- **`Dataset.status` stays `enum: [PUBLISHED]` in the spec.** It reads like a description of what
  the reads return, but `validateRequests` is on and `validateResponses` is off, so it is really a
  write guard: it is what makes `PUBLISHED` the only status `PATCH` can set, and therefore what
  keeps `ARCHIVED` reachable only through `DELETE` (archive + soft-delete + DAI refresh). Widening
  it to the full enum to "document" admin reads would silently remove that guard.
- **ARCHIVED needs no mention anywhere.** Archiving also soft-deletes, so archived datasets are
  excluded from every read for every caller, privileged or not.
