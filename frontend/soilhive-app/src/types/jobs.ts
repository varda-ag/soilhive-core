export type AsyncJobStatus = 'created' | 'active' | 'completed' | 'failed';

export type AsyncJob = {
  id: string;
  status: AsyncJobStatus;
  progress: number;
  data: {
    download_path?: string;
    progress_percentage: number;
    format: string;
  };
};
