import type { SoilIndexJobParameters } from './Job';
import type { AggregationUnit } from '../jobs/runs/types';
import type { DataRequestStatus } from '../types/enums';

/**
 * What was asked, plus the scope it resolved to — the `request` of a Soil Index Run, as a Data
 * Request's is (docs/adr/0044). Never `created_by`, `isDataAdmin` or `isSuperAdmin`: anyone holding
 * the id can read it.
 */
export interface SoilIndexRunParameters extends SoilIndexJobParameters {
  /** Filter holding the Aggregation Units; null when they are `filter_id`'s own geometries. */
  derived_filter_id: string | null;
  unit_count: number;
  units: AggregationUnit[];
}

/** What a completed Run produced. */
export interface SoilIndexRunOutput {
  score_count: number;
  /** [west, south, east, north] in EPSG:4326; absent when the Run scored nothing. */
  bounds?: [number, number, number, number];
  /** The Run's TileJSON, relative to the API base. */
  tiles: string;
}

/**
 * One Soil Index Run as `/soil-indexes` reports it, from its job while that lives and from its
 * `soil_index_runs` row afterwards. Statuses are the Data Request's vocabulary (docs/adr/0037).
 */
export interface SoilIndexRun {
  /** The job's id, and the whole of the permission to read the Run's scores. */
  id: string;
  status: DataRequestStatus;
  created_at: Date;
  completed_at: Date | null;
  /** Only while the job exists. */
  progress_percentage?: number;
  progress_description?: string;
  /** Display-ready failure copy. Null unless the Run failed. */
  message: string | null;
  request: SoilIndexRunParameters;
  /** Present once the Run completed. */
  data?: SoilIndexRunOutput;
}
