export type AsyncJobStatus = 'created' | 'retry' | 'active' | 'completed' | 'failed' | 'cancelled';

export const isJobFinished = (status?: string) => status === 'completed' || status === 'failed';

export type AsyncJob = {
  id: string;
  status: AsyncJobStatus;
  progress: number;
  created_at: string;
  completed_at?: string | null;
  data: {
    download_path?: string;
    download_filename?: string;
    progress_percentage: number;
    formats: string[];
    dataset_ids?: string[];
  };
  message?: string;
};
