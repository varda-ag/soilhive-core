export type AsyncJobStatus = 'created' | 'active' | 'completed' | 'failed' | 'cancelled';

export type AsyncJob = {
  id: string;
  status: AsyncJobStatus;
  progress: number;
  data: {
    download_path?: string;
    download_filename?: string;
    progress_percentage: number;
    format: string;
  };
};
