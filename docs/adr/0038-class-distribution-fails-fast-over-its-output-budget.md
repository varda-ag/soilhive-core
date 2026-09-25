# A Class Distribution fails fast over its output budget instead of truncating

A Class Distribution has one row per (Dataset, unit, Year Window, depth bucket), so it can reach millions of rows, far more than one `data_requests.data` value can hold (docs/adr/0021, 0037). Before aggregating, the Run counts its rows and fails if rows × (classes + 1) exceeds `DATA_REQUESTS_MAX_CLASS_ENTRIES`, naming the parameters that shrink it.

This departs from 0021, which truncates `descriptive`'s detail level. That works because `descriptive` has a headline level worth delivering on its own. Every Class Distribution row is detail the caller asked for, so a truncated result would silently drop requested data.

## Consequences

- The budget counts class entries, not cells, and has its own variable: descriptive cells and class-distribution rows differ in size.
- `truncated` never appears: a result is complete or the Run failed.
- The pre-count must use exactly the same bucketing as the aggregate.

## Considered options

- **Copy 0021's always-complete headline level:** rejected. It invents a level nobody asked for.
- **Truncate rows:** rejected. It silently drops requested data.
- **Spill to storage, as `export` does:** still the long-term escape hatch, and an API change.
