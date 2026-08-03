import type { StatisticsType } from '../types/enums';
import type {
  AggregationUnit,
  CreaIndexCollection,
  DatasetExcludeReason,
  DatasetNote,
  DatasetSkipReason,
  SoilStatisticsResult,
} from '../jobs/soil-statistics/types';

export type AnyJob = BulkLoadJob | RasterLoadJob | ExportJob | FileToDbJob | BulkDeleteJob | RefreshDaiStatsJob | SoilStatisticsJob;

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

export interface SoilStatisticsJobParameters {
  /**
   * Which product to compute over the Aggregation Units. Absent means `descriptive`.
   * The parameters a type does not use are rejected at enqueue time, not ignored:
   * `histogram_bins` and `dataset_ids` apply to `descriptive` only.
   */
  statistics_type?: StatisticsType;
  /** Supplies the criteria; also supplies the AOI when no file_id is given. */
  filter_id: string;
  /**
   * When present, each geometry in this file becomes one Aggregation Unit and the
   * Filter's own geometries are NOT used — filter_id then contributes criteria only.
   */
  file_id?: string;
  /** Dataset slugs. Absent means every dataset the filter matches that the caller can preview. */
  dataset_ids?: string[];
  histogram_bins?: number;
  /** Field of the source file whose value labels each Aggregation Unit. */
  label_field?: string;
}

/**
 * Every field below the Unit block is written by exactly one Statistics Type, because each
 * producer owns its own output keys — so a field belonging to another type is *absent*,
 * not null. The type system cannot express that here: updateJobState is typed
 * Partial<ExportJob> and every call site casts past it, so this contract is upheld by the
 * producers and documented here rather than enforced.
 */
export interface SoilStatisticsJob extends SoilStatisticsJobParameters, CommonJobData {
  // ── written by every Statistics Type ───────────────────────────────────────────────
  /** Filter holding the Aggregation Units; null when they are filter_id's own geometries. */
  derived_filter_id: string | null;
  unit_count: number;
  units: AggregationUnit[];

  // ── `descriptive` only ─────────────────────────────────────────────────────────────
  /** True when at least one group's per-(year, depth) breakdown was dropped. */
  truncated: boolean;
  results: SoilStatisticsResult[];
  skipped_datasets: DatasetNote<DatasetSkipReason>[];
  excluded_datasets: DatasetNote<DatasetExcludeReason>[];

  // ── `crea-index` only ──────────────────────────────────────────────────────────────
  /** One Point per Aggregation Unit, its `id` being the `unit_id`. */
  crea_index: CreaIndexCollection;
}
