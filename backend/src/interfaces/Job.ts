import { Token } from './Token';

export const enum JobStatus {
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface Job {
  id: string | null;
  // status: JobStatus;
  // progress_percentage: number;
  // progress_description?: string;
  // created_by: string;
  // created_at: Date;
  // updated_at: Date | null;
  // completed_at: Date | null;
  // failed_at: Date | null;
}

export interface BulkLoadJob {
  dataset_id: string;
  token: Token;
}
