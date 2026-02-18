export interface Job {
  id: string | null;
  queue: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  data: BulkLoadJob | ExportJob;
}

export interface CommonJobData {
  type: string;
  created_by: string | null;
  progress_percentage: number;
  progress_description?: string;
}

export interface BulkLoadJob extends CommonJobData {
  dataset_id: string;
}

export interface ExportJob extends CommonJobData {
  filter_id: string;
  format: string;
}
