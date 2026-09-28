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

// ---- The Data Request (GET /data-requests/{id}) ----

// One aggregation area. The results only carry its unit_id: this is where its label and area are.
export interface PluginAggregationUnit {
  unit_id: string;
  label: string | null; // value of label_field, when one was given
  record_ids: number[];
  area_m2: number | null;
  raster_filtered: boolean; // raster filters applied, so the effective area is below area_m2
}

// What was asked, plus the aggregation areas it resolved to.
export type PluginDataRequestParameters<S extends PluginDataRequestSubmission> = S & {
  config_id?: string; // the config item the request is attached to
  derived_filter_id: string | null;
  unit_count: number;
  units: PluginAggregationUnit[];
};

export type PluginDataRequestStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PluginDataRequestOf<S extends PluginDataRequestSubmission> {
  id: string; // store it to read the result again, and delete it once unused
  statistics_type: S['statistics_type']; // copy of request.statistics_type: narrow on this one
  status: PluginDataRequestStatus;
  created_at: string;
  completed_at: string | null; // null while pending or running
  progress_percentage?: number;
  progress_description?: string;
  message: string | null; // why it failed; null unless status is 'failed'
  request: PluginDataRequestParameters<S>;
  data?: PluginDataRequestData<S>; // present once status is 'completed'
}

// Narrow on statistics_type to type data.
export type PluginDataRequest =
  | PluginDataRequestOf<PluginDescriptiveSubmission>
  | PluginDataRequestOf<PluginClassDistributionSubmission>
  | PluginDataRequestOf<PluginValueRangeSubmission>;

// ---- Hook result ----

export interface PluginDataRequestError {
  kind: 'lost' | 'forbidden' | 'unavailable'; // deleted or never existed | no read on its config item | server or network, retried
  message: string;
}

export interface PluginDataRequestResult extends PluginQueryResult<PluginDataRequest> {
  error: PluginDataRequestError | undefined; // on 'lost' and 'forbidden', data is undefined
}
