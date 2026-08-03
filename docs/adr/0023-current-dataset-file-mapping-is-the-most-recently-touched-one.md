# ADR 0020: A File's Current Dataset File Mapping is the most recently touched one

**Status:** Accepted

## Context

`dataset_file_mappings` is unique on `(data_mapping_id, file_id, dataset_id)`, so one File in one Dataset can carry any number of mapping rows as long as each points at a different Data Mapping. `createMapping` inserts unconditionally and only rejects the exact triple, so this is reachable through the API today.

The admin UI never produces it. It POSTs one placeholder row per new File with no `mappingId`, then PATCHes that same row in the mapping and preview steps — so re-declaring a mapping overwrites `data_mapping_id` in place and accumulates no history. Multiple rows for one File therefore only arise from direct API use.

Both loaders nevertheless had to pick one, and both did it with `mappings.find(m => m.file_id === file.id)` over the result of a `find()` with no `ORDER BY`. That is not "the first" or "the latest" mapping — it is whichever row Postgres happened to return, which makes what a load ingests depend on physical row order. A Raster Ingest writes layers and footprints, so the cost of loading the wrong declaration is not cheap to discover or undo.

## Decision

Several Dataset File Mappings per File remain permitted. Exactly one is **Current** — the one with the greatest `(updated_at, id)` — and every earlier one is **Superseded**: retained history, not a defect. Both Bulk Load and Raster Load consult only the Current one and never fall back to a Superseded one.

Selection is a single helper, `DatasetFileMappingService.currentMappingsByFile`, which collapses the mappings of **one Dataset** into a `Map` keyed by `file_id`. It lives on the entity's own service because "which mapping is in force" is knowledge about Dataset File Mappings, not about raster or vector loading, and both loaders call it.

`updated_at DESC, id DESC` rather than creation order, because PATCH is the only way the UI re-declares a mapping: under creation order the PATCH endpoint could repoint a row's `data_mapping_id` and have no effect on what loads. The `id` tiebreak matters because both timestamp defaults are `now()`, which is transaction-scoped — rows inserted in one transaction share `updated_at` byte for byte, while `uuidv7()` is evaluated per row.

## Considered options

**A partial unique index on `(dataset_id, file_id)`, forbidding the situation outright.** Rejected on two counts. The upload step POSTs placeholders inside `Promise.allSettled`, gated on a client-side ref of known file ids; any staleness there re-POSTs for a File that already has a row, which today is a harmless duplicate and under a constraint becomes a 409 surfacing as a failed save in the busiest step of the ingestion wizard. And the index cannot be built while any Dataset holds duplicates, so it is gated on inspecting production data and deleting rows — including rows a past load may have used.

**Falling back to the newest *usable* mapping when the Current one cannot be parsed.** Rejected: a typo in the newest mapping would silently ingest the declaration an admin deliberately replaced. ADR 0017 validates every mapping before the first write precisely so a misconfigured Dataset aborts instead of partially loading; a fallback inverts that.

**Ordering inside `getMappings`, leaving `find()` in place.** The smallest diff and the most fragile: `find()` would be load-bearing on a sort established in another file with nothing at the call site saying so, and it would change the listing endpoint's ordering as a side effect.

**Doing the selection in SQL with `DISTINCT ON`.** Defensible, but it costs a round trip — the loaders already hold the full array — and it cannot be unit-tested without a database.

## Consequences

- A client that POSTs a mapping for a File that already has one silently changes what the next load ingests. This is inherent to "latest wins" and is the main reason the rule is recorded here rather than only in code.
- `updated_at` is bumped by any field change, so repointing a mapping's `file_id` promotes it to Current even though its declaration did not change.
- ADR 0017's "one mapping per file" is corrected: the storage decision it records is unchanged, but it is one mapping *in force*, not one row.
- `RL_MISSING_BAND_MAPPING` and `BL_MISSING_COLUMN_MAPPING` said "has no mapping configured", which was never accurate and becomes actively misleading — every File reaching that code has a mapping, it is just a placeholder with no `data_mapping_id`. Both now name the File, and raster splits the placeholder case (`RL_MAPPING_NOT_CONFIGURED`) from the Data Mapping that names no Bands (`RL_MISSING_BAND_MAPPING`), which have different remedies.
- The `!datasetFileMapping` branch in both loaders is unreachable and is kept only as a guard: the File list is derived from the same mappings array it is looked up in, so the lookup cannot miss.
- **Known gap, deliberately not closed:** nothing outside the loaders knows about Current. The preview step selects `datasetFileMappings[0]` from an unordered listing, so an admin can edit a Superseded mapping and see no effect on the next load. Closing it means exposing Current-ness in the API response rather than ordering the listing — an order the frontend depended on without saying so would be the same fragility this ADR rejects. Left open because only a Dataset built through direct API calls can reach it.
