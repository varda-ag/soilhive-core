import type { ClassDefinition } from '../../interfaces/Job';

/** How many values a row holds: Observations for a Soil Property, scores for a Soil Index Run. */
export type ValueCount = { n_observations: number; n_scores?: never } | { n_scores: number; n_observations?: never };

/** Bucket keys of a row; a pooled dimension has none. Null keys are the no-year / no-depth buckets. */
export interface BucketKeys {
  year_start?: number | null;
  year_end?: number | null;
  /** Only with `depth_ranges: standard`; `depth_end` alone is null for > 200 cm. */
  depth_start?: number | null;
  depth_end?: number | null;
}

/** One `descriptive` row; `overall` rows have no `unit_id`. Empty fields are absent. */
export type SoilStatisticsRow = SoilStatisticsFigures & ValueCount;

export interface SoilStatisticsFigures extends BucketKeys {
  /** Absent for a Soil Index variable. */
  dataset_id?: string;
  unit_id?: string;
  /** Absent for a Soil Index variable. */
  n_features?: number;
  min: number;
  p05: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
  mean: number;
  /** Absent below 2 values. */
  stddev?: number;
  /** Tukey fences: p25 - 1.5·IQR and p75 + 1.5·IQR. */
  lower_fence: number;
  upper_fence: number;
  /** Values beyond each fence. */
  n_outliers_low: number;
  n_outliers_high: number;
  /** Most extreme values inside the fences, where box-plot whiskers end. */
  whisker_low: number;
  whisker_high: number;
  /** Depth span of the Layers actually behind this row. */
  depth_min?: number;
  depth_max?: number;
  horizons?: string[];
  laboratory_methods?: string[];
}

/** Each Class widens every row (docs/adr/0038). */
export const MAX_CLASSES = 20;

/** Open first and last Class, plus one between. */
export const MIN_CLASS_COUNT = 3;

/** Reserved Class name */
export const UNCLASSIFIED = 'unclassified';

/** GlobalSoilMap ranges in cm, `[start, end)`; the last is open-ended. */
export const STANDARD_DEPTH_RANGES: { start: number; end: number | null }[] = [
  { start: 0, end: 5 },
  { start: 5, end: 15 },
  { start: 15, end: 30 },
  { start: 30, end: 60 },
  { start: 60, end: 100 },
  { start: 100, end: 200 },
  { start: 200, end: null },
];

export interface ClassValue {
  name: string;
  /** Percentage of the row's values (3 decimals) or a count, per `value_type`. */
  value: number;
}

/** One (Dataset, unit, Year Window, depth bucket): one pie chart. */
export type ClassDistributionRow = ClassDistributionFigures & ValueCount;

export interface ClassDistributionFigures extends BucketKeys {
  /** Absent for a Soil Index variable. */
  dataset_id?: string;
  unit_id: string;
  /** Depth span of the Layers actually behind this row. */
  depth_min?: number;
  depth_max?: number;
  /** Absent for a Soil Index variable. */
  n_features?: number;
  /** In Class order, then `unclassified` when above 0. */
  classes: ClassValue[];
}

export interface SoilPropertyVariableHeader {
  soil_property: string;
  standard_unit: string | null;
}

export interface SoilIndexVariableHeader {
  run: string;
  /** Absent when the Run scored nothing. */
  soil_index_type?: string;
}

export type VariableHeader = SoilPropertyVariableHeader | SoilIndexVariableHeader;

/** The `descriptive` payload: Soil Statistics. */
export type SoilStatisticsOutput = VariableHeader & {
  /** Per (Dataset, Year Window, depth bucket), each value counted once. */
  overall: SoilStatisticsRow[];
  results: SoilStatisticsRow[];
};

export type ClassDistributionOutput = ClassDistributionBody & VariableHeader;

export interface ClassDistributionBody {
  /** The request's Classes, or the generated ones. */
  classes: ClassDefinition[];
  /** Request-wide extremes; absent when nothing matched. */
  observed_min?: number;
  observed_max?: number;
  results: ClassDistributionRow[];
}

/** `min` and `max` are absent when nothing matched. */
export type ValueRangeCounts = ValueCount & { min?: number; max?: number };

export type ValueRangeFigures = ValueRangeCounts & { n_features: number };

/** Per (Dataset, Year Window); year keys absent under `time_aggregation: none`. */
export type DatasetValueRange = ValueRangeFigures & BucketKeys & { dataset_id: string };

/** Request-wide per Year Window; the list is absent under `time_aggregation: none`. */
export type WindowValueRange<F extends ValueRangeCounts = ValueRangeFigures> = F & BucketKeys;

/** Top-level figures cover the whole request and all years (each Observation once). */
export type SoilPropertyValueRange = ValueRangeFigures &
  SoilPropertyVariableHeader & {
    windows?: WindowValueRange[];
    datasets: DatasetValueRange[];
  };

/** No `datasets`: scores have no Dataset or Feature. */
export type SoilIndexValueRange = ValueRangeCounts &
  SoilIndexVariableHeader & {
    windows?: WindowValueRange<ValueRangeCounts>[];
  };

export type ValueRangeOutput = SoilPropertyValueRange | SoilIndexValueRange;

/** Which one is told by `request.statistics_type`. */
export type DataRequestOutput = SoilStatisticsOutput | ClassDistributionOutput | ValueRangeOutput;
