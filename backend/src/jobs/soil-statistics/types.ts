/** Cells at or below this count carry no histogram — see `StatisticsCell.histogram`. */
export const MIN_HISTOGRAM_COUNT = 100;

/**
 * Bin counts over 10 (or `histogram_bins`) equal-width bins spanning [min, max].
 *
 * Bin boundaries are not transmitted: they are `min + i * bin_width` for i in 0..counts.length,
 * with the last boundary being exactly the cell's `max`. `counts.length === 1` — not
 * `bin_width === 0` — is the signal that every value in the cell is identical, because a
 * genuine width below 0.0005 also rounds to 0.
 */
export interface Histogram {
  /** Rounded to 3 decimals; 0 when every value in the cell is identical. */
  bin_width: number;
  counts: number[];
}

/**
 * Descriptive statistics over one set of Observation values, all in `standard_unit`.
 *
 * Two conventions keep a cell small, because the whole result is stored inside the job's
 * `data` jsonb and returned in one HTTP response (docs/adr/0021):
 *  - every non-integer statistic is rounded to 3 decimals, float8's remaining digits
 *    being bytes without meaning for a soil measurement;
 *  - a statistic that has no value is **absent**, never `null` or `[]`. At the cell cap
 *    the key names alone outweigh the data, so an empty field costs more than it says.
 */
export interface StatisticsCell {
  count: number;
  /** Distinct Features (sampling locations) behind `count` — the sample support. */
  n_features: number;
  n_layers: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Sample standard deviation; absent when count < 2. */
  stddev?: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  sampling_date_min?: string;
  sampling_date_max?: string;
  depth_min?: number;
  depth_max?: number;
  /** Distinct non-null horizons mixed into this cell; absent when none are recorded. */
  horizons?: string[];
  /**
   * Distinct laboratory methods mixed into this cell — more than one means the summary
   * spans methods. Absent when none are recorded.
   */
  laboratory_methods?: string[];
  /**
   * Absent when `count <= MIN_HISTOGRAM_COUNT`: over a handful of Observations the bins
   * describe the sample rather than the distribution, and `min`/`median`/`max` already
   * say what little there is to say.
   */
  histogram?: Histogram;
}

/**
 * One (year, depth interval) slice of a unit's statistics. Nulls are their own buckets,
 * and — unlike the statistics above — are spelled out rather than omitted: here a null is
 * the bucket's identity ("no recorded year"), not a value that happens to be missing.
 *
 * `depth_min`/`depth_max` are dropped: the L4 grouping is *by* min_depth and max_depth,
 * so those aggregates would repeat this cell's own key once per cell.
 */
export interface BreakdownCell extends Omit<StatisticsCell, 'depth_min' | 'depth_max'> {
  year: number | null;
  min_depth: number | null;
  max_depth: number | null;
}

export interface UnitStatistics extends StatisticsCell {
  unit_id: string;
  /**
   * Absent for two different reasons, told apart by `l4_included` on the group:
   *  - `l4_included: false` — the whole group's breakdown was dropped to fit the output
   *    budget, and the detail is genuinely unavailable;
   *  - `l4_included: true` — this unit's Observations all fall in one (year, depth
   *    interval), so the single cell would repeat this unit's statistics verbatim. Its
   *    keys are recoverable from the unit cell: `min_depth`/`max_depth` are `depth_min`/
   *    `depth_max`, and `year` is the first four characters of `sampling_date_min` when
   *    they are digits (exactly how the aggregation derives it), else null.
   *
   * Never an empty array — a present `breakdown` always holds at least two cells.
   */
  breakdown?: BreakdownCell[];
}

export interface SoilStatisticsResult {
  /** Dataset slug (the public identifier). */
  dataset_id: string;
  /** Soil property slug. */
  soil_property: string;
  standard_unit: string | null;
  /** False when this group's per-(year, depth) breakdown was dropped to fit the output budget. */
  l4_included: boolean;
  /** Computed before units are fanned out, so overlapping units count an Observation once. */
  overall: StatisticsCell;
  units: UnitStatistics[];
}

/** An Aggregation Unit: one UserGeometry, plus how to recognise it. */
export interface AggregationUnit {
  unit_id: string;
  /** Value of `label_field` for the source row, when given. */
  label: string | null;
  /** Source rows that resolved to this unit — several when the file repeats a geometry. */
  record_ids: number[];
  /** Rounded to 3 decimals, as everywhere in this output. */
  area_m2: number | null;
  /**
   * True when raster filters applied: the unit's geometry and area are unchanged by
   * them, so the effective area the statistics cover is smaller than `area_m2`.
   */
  raster_filtered: boolean;
}

export type DatasetSkipReason = 'no_preview_entitlement';
export type DatasetExcludeReason = 'raster';

export interface DatasetNote<R extends string = string> {
  /** Dataset slug. */
  id: string;
  reason: R;
}

export interface SoilStatisticsOutput {
  results: SoilStatisticsResult[];
  truncated: boolean;
}
