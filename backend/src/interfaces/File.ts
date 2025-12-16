import type { IngestionStatus } from '../types/data';

export interface File {
  id: string;
  slug?: string;
  file_path: string;
  status?: IngestionStatus;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
}
