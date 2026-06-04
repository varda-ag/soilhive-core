export type AnyJob = BulkLoadJob | ExportJob | FileToDbJob;

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
}

export interface BulkDeleteJob extends CommonJobData {
  dataset_id: string;
}
