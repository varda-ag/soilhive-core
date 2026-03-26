export type AnyJob = BulkLoadJob | ExportJob | FileToDbJob;

export interface Job {
  id: string | null;
  queue: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  data: AnyJob;
}

export interface CommonJobData {
  type: string;
  anonymous?: boolean;
  created_by: string | null;
  progress_percentage: number;
  progress_description?: string;
}

export interface BulkLoadJob extends CommonJobData {
  dataset_id: string;
  delete_source_files?: boolean;
}

export interface ExportJob extends CommonJobData {
  filter_id: string;
  format: string;
  dataset_ids: string[];
  total_records_estimate: number;
  current_cursor: string | null;
  total_records_processed: number;
  download_path: string | null;
}

export interface FileToDbJob extends CommonJobData {
  file_id: string;
}

export interface BulkDeleteJob extends CommonJobData {
  dataset_id: string;
}
