import type { PluginQueryResult } from './common';

// ---- Submission (body of POST /data-requests) ----

// A soil property id (e.g. 'ph'), or the id of a completed Soil Index Run.
export type PluginDataRequestVariable = { type: 'soil-property'; id: string } | { type: 'soil-index'; id: string };

export type PluginTimeAggregation = number | 'none'; // integer 1–10
export type PluginDepthRanges = 'none' | 'standard';

// min is included in the class, max is excluded. At least one bound is necessary.
export interface PluginClassDefinition {
  name: string; // 'unclassified' is reserved
  min?: number;
  max?: number;
}

interface PluginDataRequestSubmissionBase {
  filter_id: string;
  variable: PluginDataRequestVariable;
  time_aggregation: PluginTimeAggregation; // required
  dataset_ids?: string[]; // rejected for a soil-index variable
  file_id?: string;
  label_field?: string;
}

export interface PluginDescriptiveSubmission extends PluginDataRequestSubmissionBase {
  statistics_type: 'descriptive';
  depth_ranges?: PluginDepthRanges; // rejected for a soil-index variable
}

export type PluginClassDistributionSubmission = PluginDataRequestSubmissionBase & {
  statistics_type: 'class-distribution';
  value_type: 'percentage' | 'count';
  depth_ranges?: PluginDepthRanges;
} & (
    | { classes: PluginClassDefinition[]; class_count?: never; class_method?: never } // 1–20
    | { class_count: number; class_method: 'equal-interval' | 'quantile'; classes?: never } // 3–20
  );

export interface PluginValueRangeSubmission extends PluginDataRequestSubmissionBase {
  statistics_type: 'value-range';
}

export type PluginDataRequestSubmission = PluginDescriptiveSubmission | PluginClassDistributionSubmission | PluginValueRangeSubmission;

// ---- Results (the `data` field of GET /data-requests/{id}) ----

// Soil property: soil_property + standard_unit. Soil index: run + soil_index_type.
export interface PluginDataRequestVariableHeader {
  soil_property?: string;
  standard_unit?: string | null;
  run?: string;
  soil_index_type?: string;
}

// An absent key means the dimension is pooled. null means the no-year or no-depth bucket.
export interface PluginResultRowKeys {
  dataset_id?: string; // absent for a soil index
  unit_id?: string; // absent on overall rows
  year_start?: number | null;
  year_end?: number | null;
  depth_start?: number | null;
  depth_end?: number | null; // null alone: deeper than 200 cm
  depth_min?: number;
  depth_max?: number;
}

// Soil property: n_observations + n_features. Soil index: n_scores.
export interface PluginResultCounts {
  n_observations?: number;
  n_scores?: number;
  n_features?: number;
}

export interface PluginSoilStatisticsRow extends PluginResultRowKeys, PluginResultCounts {
  min: number;
  p05: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
  mean: number;
  stddev?: number; // absent below 2 values
  lower_fence: number;
  upper_fence: number;
  whisker_low: number;
  whisker_high: number;
  n_outliers_low: number;
  n_outliers_high: number;
  horizons?: string[];
  laboratory_methods?: string[]; // more than one: the figures mix methods
}

// statistics_type 'descriptive'
export interface PluginSoilStatistics extends PluginDataRequestVariableHeader {
  overall: PluginSoilStatisticsRow[]; // per dataset × period × depth, units combined
  results: PluginSoilStatisticsRow[]; // per dataset × unit × period × depth
}

export interface PluginClassValue {
  name: string; // a class name, or 'unclassified'
  value: number; // percentage (sums to 100) or count, as value_type says
}

export interface PluginClassDistributionRow extends PluginResultRowKeys, PluginResultCounts {
  unit_id: string;
  classes: PluginClassValue[];
}

// statistics_type 'class-distribution'
export interface PluginClassDistribution extends PluginDataRequestVariableHeader {
  classes: PluginClassDefinition[]; // the request's classes, or the generated ones
  observed_min?: number;
  observed_max?: number;
  results: PluginClassDistributionRow[]; // a missing row means no observations
}

export interface PluginValueRangeFigures extends PluginResultCounts {
  min?: number; // absent when nothing matched
  max?: number;
}

export interface PluginYearKeys {
  year_start?: number | null;
  year_end?: number | null;
}

// statistics_type 'value-range'
export interface PluginValueRange extends PluginDataRequestVariableHeader, PluginValueRangeFigures {
  windows?: (PluginValueRangeFigures & PluginYearKeys)[]; // absent when time_aggregation is none
  datasets?: (PluginValueRangeFigures & PluginYearKeys & { dataset_id: string })[]; // absent for a soil index
}

// The data type follows statistics_type.
export type PluginDataRequestData<S extends PluginDataRequestSubmission> = S extends { statistics_type: 'descriptive' }
  ? PluginSoilStatistics
  : S extends { statistics_type: 'class-distribution' }
    ? PluginClassDistribution
    : S extends { statistics_type: 'value-range' }
      ? PluginValueRange
      : never;

// ---- Hook result ----

export type PluginDataRequestStatus = 'idle' | 'submitting' | 'pending' | 'running' | 'completed' | 'failed';

export interface PluginDataRequestError {
  kind: 'rejected' | 'failed' | 'lost'; // POST 4xx | Run failed | GET 404
  message: string; // backend message, or the error body
}

export interface PluginDataRequestResult<T> extends PluginQueryResult<T> {
  status: PluginDataRequestStatus;
  data: T | undefined; // last completed result for this call
  isStale: boolean; // true: data is from the previous submission
  error: PluginDataRequestError | undefined;
  retry: () => void;
}
