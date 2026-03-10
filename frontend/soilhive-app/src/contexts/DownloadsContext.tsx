import { useCancelJobMutation, useCreateJobMutation, useJobsQueries } from 'hooks/useJobsApi';
import React, { createContext, useState, type ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AsyncJob } from 'types/jobs';
import useNotifications from 'hooks/useNotifications';
import { BACKEND_BASE_URL } from '../configuration/api';

type DownloadsItem = {
  id: string;
  status?: string;
  progress: number;
};

type DownloadsContextType = {
  downloads: DownloadsItem[];
  startDownload: (payload: { filter_id: string; dataset_ids: string[]; format: string }) => void;
  cancelDownload: (id: string) => void;
};

export const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

type DownloadsProviderProps = {
  children: ReactNode;
};

export const DownloadsProvider: React.FC<DownloadsProviderProps> = ({ children }) => {
  const [jobsIds, setJobsIds] = useState<string[]>([]);
  const prevStatusRef = useRef<Record<string, string | undefined>>({});
  const createJob = useCreateJobMutation();
  const cancelJob = useCancelJobMutation();

  const { showNotification } = useNotifications();

  const jobsQueries = useJobsQueries(jobsIds);

  const jobsData = useMemo(() => jobsQueries.map(query => query.data).filter((job: AsyncJob | undefined) => !!job), [jobsQueries]);

  const downloads = useMemo(() => {
    return jobsData
      .filter(job => job.status !== 'completed' && job.status !== 'failed')
      .map(job => ({
        id: job.id,
        status: job.status,
        progress: job.data?.progress_percentage ?? 0,
      }));
  }, [jobsData]);

  const startDownload = useCallback(
    async (payload: { filter_id: string; dataset_ids: string[]; format: string }) => {
      const res = await createJob.mutateAsync({ ...payload, type: 'export' });

      setJobsIds(prev => [...prev, res.id]);
      prevStatusRef.current[res.id] = 'created';

      return res.id;
    },
    [createJob],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      await cancelJob.mutateAsync({ jobId: id });
      setJobsIds(prev => prev.filter(jobId => jobId !== id));
      delete prevStatusRef.current[id];
    },
    [cancelJob],
  );

  useEffect(() => {
    jobsData.forEach(job => {
      const prevStatus = prevStatusRef.current[job.id];
      const nextStatus = job.status;

      if (prevStatus === nextStatus) return;

      if (nextStatus === 'completed') {
        const filePath = (job.data.download_path as string).replace(/\//g, '%2F');
        const url = `${BACKEND_BASE_URL}downloads/${filePath}`;

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      if (nextStatus === 'failed') {
        showNotification({ id: `downloads-${job.id}`, title: 'Extracting data error', message: 'Please try again later' });
      }

      prevStatusRef.current[job.id] = nextStatus;
    });
  }, [jobsData, showNotification]);

  const value = useMemo(() => ({ downloads, startDownload, cancelDownload }), [downloads, startDownload, cancelDownload]);

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
};
