# Descriptive statistics fail fast, superseding truncation

`descriptive` now has the same shape as `class-distribution`: one `variable`, and flat rows per (Dataset, unit, Year Window, depth bucket) plus `overall` rows without the unit. It has no histogram. Every row is one the caller asked for, so there is no detail level left to drop. As in ADR 0038, the Run counts `results` + `overall` rows first and fails when they exceed `DATA_REQUESTS_MAX_CELLS`.

This supersedes ADR 0021's all-or-nothing truncation, its histogram rules and its single-cell omission. Its caps on units and per-cell bytes still apply.

## Consequences

- `truncated`, `l4_included` and `histogram_bins` are gone. Histograms are `class-distribution`'s job.
- `DATA_REQUESTS_MAX_CELLS` now counts rows.
