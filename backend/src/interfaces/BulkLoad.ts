export const enum BulkLoadStatus {
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface BulkLoad {
  id: string;
  dataset_id: string;
  status: BulkLoadStatus;
  progress_percentage: number;
  progress_description?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
}
