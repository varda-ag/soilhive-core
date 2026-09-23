# A Class Distribution fails fast over its output budget instead of truncating

The `class-distribution` Statistics Type returns one distribution per (Dataset, Aggregation Unit, Year Window, depth bucket), and its size is the product of all four times the number of Classes. At the current unit cap of 2000, a plausible request reaches over a million cells and hundreds of megabytes: far past what a single `data_requests.data` jsonb value and one HTTP response can hold (docs/adr/0021, docs/adr/0037). We therefore count the distinct cell keys once the Observations are selected and before any distribution is computed, and fail the Run if `cells × (classes + 1)` exceeds an env-configurable budget of class entries. The failure message names the levers the caller controls: a coarser `time_aggregation`, pooled depths, fewer Units or fewer Datasets.

This deliberately departs from docs/adr/0021, which rejected a pre-flight failure for `descriptive` in favour of all-or-nothing truncation of its finer level. That argument depended on two things this type does not have. `descriptive` has a headline level (L1) that is valuable by itself and worth delivering even when the detail is lost, whereas every Class Distribution cell is detail the caller explicitly asked for, so there is nothing to degrade to. And 0021's failure would come after the user had waited, whereas this check runs seconds into the Run. The principle behind 0021, *never silently drop user-supplied input*, is what decides it here: a truncated Class Distribution would drop exactly what was requested.

## Consequences

- **The budget counts class entries, not cells**, and has its own variable rather than reusing `DATA_REQUESTS_MAX_CELLS`. A descriptive cell and a class-distribution cell are unrelated in size, and a class-distribution cell grows with the number of Classes. The number of Classes per request is capped for the same reason.
- **`truncated` is never true for this type.** A client never has to handle partial Class Distributions: a result is either complete or absent, and a failed Data Request says why.
- **The pre-count must use the same bucketing as the computation** (Year Window alignment, Standard Depth Range midpoint, null buckets). If the two diverge, the check approves a result that is then too large, or rejects one that would have fitted.

## Considered options

- **Copy 0021: an always-complete per-(Dataset, Unit) level, with the cell detail dropped all-or-nothing per Dataset.** Rejected: it invents a headline level nobody asked for to have something to degrade to, and it enlarges the output of every request to protect the few that are too large.
- **Truncate cells past the budget.** Rejected: it silently drops requested data, and a flat cut drops whichever Datasets sort last, the exact failure 0021 describes.
- **Spill to storage and return a presigned path, as `export` does.** Still the long-term escape hatch for both types, and still an API change. Not justified while the levers above let a caller fit within the budget.
