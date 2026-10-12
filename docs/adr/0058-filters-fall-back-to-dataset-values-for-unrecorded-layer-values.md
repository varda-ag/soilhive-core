# Filters fall back to Dataset values where a Layer recorded none

A Layer with no `sampling_date`, depth bound or licence never matched a bounded Filter criterion, so a Dataset whose provider gave those values only at Dataset level could not be found by date, depth or licence at all. We decided that, wherever Filter criteria are applied (coverage, datasets, `/soil-data`, Export, Data Requests, the live DAI path), a DatasetLayer missing one of these values matches on its Dataset's `reference_period_*`, `soil_depth` bound or `licenses` instead — the **Dataset fallback** (CONTEXT.md). It is per DatasetLayer, not per Layer, because a Layer is shared across Datasets.

## Considered options

- **Whole-Dataset fallback only** (only when the admin supplied the value, i.e. it is not in `inferred_properties`) — rejected: it ties query semantics to the metadata form's bookkeeping column. Accepted cost: in a partly dated Dataset, the undated Layers take the period the dated ones were summarised into.
- **Containment instead of overlap** — rejected for consistency: Raster Layer periods and `ds.licenses` already match by overlap. For licences this means a `cc-by` filter can return rows that are really `cc-by-nc` in a `{cc-by, cc-by-nc}` Dataset; a Filter discovers, it grants nothing.
- **Keeping admin-supplied values apart from inferred ones** — deferred. A load that adds dated Layers to an undated Dataset replaces the admin's period, and the undated Layers move with it.

## Consequences

These asymmetries are deliberate; do not "fix" them:

- **Bounded criteria see effective values, `null` criteria see recorded ones.** `min_sampling_date: null` still means "the Layer recorded no date", which makes it the way to find fallback-matched data. ADR 0007's null-vs-absent identity is unchanged.
- **Matching and the coverage summary use effective values; rows and analytics do not.** `/soil-data` rows, Export files, Year Windows and Standard Depth Ranges keep recorded dates and depths, because a period is not a date. (A row's licence already fell back to its Dataset's first before this decision, and still does.)
- **The DAI matches with the fallback but scores without it.** `num_dated_layers` and `num_distinct_years` count recorded dates only (ADR 0002). The precomputed path (ADR 0009) is unaffected, since it only serves Filters without these criteria.
- **Dataset-level metadata is now query input.** Loads therefore no longer let a NULL aggregate wipe an existing value, and the vector stop is computed as the latest-ending Partial date rather than the text `MAX`.
- Persisted Filters return more data after this change, which also counts against Export Limits.
