import { BucketKeys, STANDARD_DEPTH_RANGES, ValueCount } from '../jobs/data-requests/types';
import { DepthRanges } from '../types/enums';
import { TimeAggregation } from '../interfaces/Job';

/** Year Windows align to multiples of N, so a year always lands in the same one; `none` pools all years. */
export const yearStartSql = (timeAggregation: TimeAggregation): string => {
  if (timeAggregation === 'none') {
    return 'NULL::int';
  }
  // Interpolated into SQL.
  if (!Number.isInteger(timeAggregation) || timeAggregation < 1) {
    throw new Error(`Invalid time aggregation: ${timeAggregation}`);
  }
  return `CASE WHEN o.year IS NULL THEN NULL ELSE (FLOOR(o.year::numeric / ${timeAggregation}) * ${timeAggregation})::int END`;
};

/** Standard Depth Range holding the Layer's midpoint; `none` pools every depth under one key. */
export const depthStartSql = (depthRanges: DepthRanges): string => {
  if (depthRanges === DepthRanges.NONE) {
    return 'NULL::int';
  }
  const bounded = STANDARD_DEPTH_RANGES.filter(range => range.end !== null);
  const last = STANDARD_DEPTH_RANGES[STANDARD_DEPTH_RANGES.length - 1]!;
  const branches = bounded.map(range => `WHEN (o.min_depth + o.max_depth) / 2.0 < ${range.end} THEN ${range.start}`).join('\n        ');
  return `CASE
        WHEN o.min_depth IS NULL OR o.max_depth IS NULL THEN NULL
        ${branches}
        ELSE ${last.start}
      END`;
};

const DEPTH_END_BY_START = new Map(STANDARD_DEPTH_RANGES.map(range => [range.start, range.end]));

/** Output keys for a bucket; a pooled dimension has none. */
export const bucketKeys = (
  yearStart: number | null,
  depthStart: number | null,
  timeAggregation: TimeAggregation,
  depthRanges: DepthRanges,
): BucketKeys => ({
  ...(timeAggregation === 'none' ? {} : { year_start: yearStart, year_end: yearStart === null ? null : yearStart + timeAggregation - 1 }),
  ...(depthRanges === DepthRanges.STANDARD
    ? { depth_start: depthStart, depth_end: depthStart === null ? null : (DEPTH_END_BY_START.get(depthStart) ?? null) }
    : {}),
});

/** `n_observations` for a Soil Property, `n_scores` for a Soil Index Run's scores. */
export const valueCount = (count: number, scores: boolean): ValueCount => (scores ? { n_scores: count } : { n_observations: count });
