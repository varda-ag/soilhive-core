# Soil Index scores honour the Filter's sampling dates and ignore its other criteria

**Status:** Accepted — amends ADR 0039

A Filter's `min_sampling_date` and `max_sampling_date` now narrow Soil Index scores in two places: when a Run is created, and when a Data Request reads a Run's scores. A score's year is a Partial date, so it is kept when that year overlaps the range. A `null` bound keeps only scores with no year, as it does for Layers. Every other criterion is ignored instead of refused. A Filter is a reusable scope shared across the map, exports and statistics, and it cannot know which product it will be used with. A client should not have to strip criteria that don't apply to scores.

## Consequences

- A Data Request's own parameters are not Filter criteria, and `dataset_ids` and `depth_ranges` are still refused over a Run. The caller wrote them for this request, so ignoring them would answer a different question.
- Run creation narrows in `processSoilIndex`, after any Soil Index Type has scored and before numbering, so no methodology can forget to. The random mock loses the points it generated outside the range.
- A Run's record copies the range it applied. A non-persistent Filter may be reaped before the Run, and the narrowing is permanent: the Run's tiles and every Data Request over it inherit it.
- A Data Request over a Run never flags its Units as `raster_filtered`, since `raster_filters` are ignored for scores.
- Ignoring is not reversible for free. Refusing a criterion again later would break callers that send it.
