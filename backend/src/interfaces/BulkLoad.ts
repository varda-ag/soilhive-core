export const enum BulkLoadStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface BulkLoad {
  id: string;
  dataset_id: string;
  status: BulkLoadStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
}
