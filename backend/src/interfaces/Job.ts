import type { StatisticsType, SoilIndexType, VariableType, DepthRanges, ValueType, ClassMethod } from '../types/enums';
import type { AggregationUnit } from '../jobs/runs/types';

export type AnyJob =
  | BulkLoadJob
  | RasterLoadJob
  | ExportJob
  | FileToDbJob
  | BulkDeleteJob
  | RefreshDaiStatsJob
  | DataRequestJob
  | SoilIndexJob;

export interface Job {
  id: string | null;
  queue: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  data: AnyJob;
  message: string | null;
}

export interface CommonJobData {
  type: string;
  anonymous?: boolean;
  created_by: string | null;
  progress_percentage: number;
  progress_description?: string;
  isDataAdmin: boolean | undefined;
  isSuperAdmin: boolean | undefined;
}

export interface BulkLoadJob extends CommonJobData {
  dataset_id: string;
  delete_source_files?: boolean;
}

export interface RasterLoadJob extends CommonJobData {
  dataset_id: string;
}

export interface ExportJobParameters {
  filter_id: string;
  formats: string[];
  dataset_ids: string[];
  public_homepage_url?: string;
  public_terms_url?: string;
  public_metadata_urls?: Record<string, string>; // Optional mapping of dataset_id to metadata URL for Readme.PDF
  target_crs?: number;
}

export interface ExportJob extends ExportJobParameters, CommonJobData {
  total_records_estimate: number;
  current_cursor: string | null;
  total_records_processed: number | null;
  total_layers_estimate: number;
  total_layers_processed: number | null;
  download_path: string | null;
  download_filename?: string;
  aoi_area_km2: number | null;
}

export interface ExportOutputs {
  total_records_processed: number | null;
  total_layers_processed: number | null;
}

export interface FileToDbJob extends CommonJobData {
  file_id: string;
  dataset_id?: string;
}

export interface BulkDeleteJob extends CommonJobData {
  dataset_id: string;
}

export interface RefreshDaiStatsJob extends CommonJobData {
  dataset_ids: string[];
}

/**
 * What a caller supplies to any job that is a **Run**: the spatial scope, resolved identically
 * for a Data Request and for a Soil Index. Only the product a queue computes differs.
 */
export interface RunJobParameters {
  /** Supplies the criteria; also supplies the AOI when no file_id is given. */
  filter_id: string;
  /**
   * When present, each geometry in this file becomes one Aggregation Unit and the
   * Filter's own geometries are NOT used — filter_id then contributes criteria only.
   */
  file_id?: string;
  /** Field of the source file whose value labels each Aggregation Unit. */
  label_field?: string;
}

/** A Run's job data: what the caller supplied, plus what resolving its Units wrote back. */
export interface RunJobData extends RunJobParameters, CommonJobData {
  /** Filter holding the Aggregation Units; null when they are filter_id's own geometries. */
  derived_filter_id: string | null;
  unit_count: number;
  units: AggregationUnit[];
}

export interface DataRequestJobParameters extends RunJobParameters {
  /**
   * Which product to compute over the Aggregation Units (required).
   */
  statistics_type: StatisticsType;
  /** Dataset slugs. Absent means every dataset the filter matches that the caller can preview. */
  dataset_ids?: string[];
  /** `descriptive` only. */
  histogram_bins?: number;
  /** `class-distribution` and `value-range` (required there). */
  variable?: ClassDistributionVariable;
  /** `class-distribution` only; exclusive with `class_count`. */
  classes?: ClassDefinition[];
  /** `class-distribution` only: total Classes to generate, 3-20. */
  class_count?: number;
  /** `class-distribution` only; required with `class_count`. */
  class_method?: ClassMethod;
  /** `class-distribution` only: Year Window in years, 1-10, default 1. */
  time_aggregation?: number;
  /** `class-distribution` only, default `none`. */
  depth_ranges?: DepthRanges;
  /** `class-distribution` only (required there). */
  value_type?: ValueType;
}

export interface ClassDistributionVariable {
  type: VariableType;
  /** Soil Property slug, or Soil Index Run id. */
  id: string;
}

/** `[min, max)`; an absent bound is open. At least one is present. */
export interface ClassDefinition {
  name: string;
  min?: number;
  max?: number;
}

export interface DataRequestJob extends DataRequestJobParameters, RunJobData {}

export interface SoilIndexJobParameters extends RunJobParameters {
  /** Which Soil Index to compute. */
  soil_index_type: SoilIndexType;
}

export interface SoilIndexJob extends SoilIndexJobParameters, RunJobData {}
