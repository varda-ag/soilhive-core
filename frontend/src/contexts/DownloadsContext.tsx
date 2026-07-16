import { useCancelJobMutation, useCreateJobMutation, useJobsQueries } from 'hooks/useJobsApi';
import React, { createContext, useState, type ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AsyncJob } from 'types/jobs';
import useNotifications from 'hooks/useNotifications';
import { BACKEND_BASE_URL, REST_END_POINTS } from '../configuration/api';
import { addStoredJobId, getStoredJobIds, removeStoredJobId } from '../utilities/downloadJobStorage';
import { downloadFile } from '../utilities/download';
import { useAuthContext } from '../auth/AuthContextProvider';

type DownloadsItem = {
  id: string;
  status?: string;
  progress: number;
};

type DownloadsContextType = {
  downloads: DownloadsItem[];
  startDownload: (payload: { filter_id: string; dataset_ids: string[]; formats: string[] }) => void;
  cancelDownload: (id: string) => void;
  isOpened: boolean;
  setIsOpened: (value: boolean) => void;
};

export const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

type DownloadsProviderProps = {
  children: ReactNode;
};

export const DownloadsProvider: React.FC<DownloadsProviderProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuthContext();
  const [jobsIds, setJobsIds] = useState<string[]>([]);
  const [isOpened, setIsOpened] = useState(false);
  const prevStatusRef = useRef<Record<string, string | undefined>>({});
  const createJob = useCreateJobMutation();
  const cancelJob = useCancelJobMutation();

  const { showNotification } = useNotifications();

  const userId = useMemo((): string | null => (isAuthenticated ? user?.profile?.sub || null : null), [isAuthenticated, user]);

  // Load pending jobs
  useEffect(() => {
    setJobsIds(getStoredJobIds(userId));
  }, [userId]);

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
    async (payload: { filter_id: string; dataset_ids: string[]; formats: string[] }) => {
      const public_metadata_urls: Record<string, string> = {};
      payload.dataset_ids.forEach(id => {
        public_metadata_urls[id] = `${window.location.origin}/datasets/${id}`;
      });
      const res = await createJob.mutateAsync({
        ...payload,
        type: 'export',
        anonymous: true,
        public_homepage_url: window.location.origin,
        public_terms_url: `${window.location.origin}/terms-of-use`,
        public_metadata_urls,
      });

      setJobsIds(prev => [...prev, res.id]);
      prevStatusRef.current[res.id] = 'created';

      addStoredJobId(res.id, userId);

      return res.id;
    },
    [createJob, userId],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      await cancelJob.mutateAsync({ jobId: id });
      setJobsIds(prev => prev.filter(jobId => jobId !== id));
      delete prevStatusRef.current[id];
      removeStoredJobId(id, userId);
    },
    [cancelJob, userId],
  );

  useEffect(() => {
    jobsData.forEach(job => {
      const prevStatus = prevStatusRef.current[job.id];
      const nextStatus = job.status;

      if (prevStatus === nextStatus) return;

      if (nextStatus === 'completed') {
        const filePath = (job.data.download_path as string).replace(/\//g, '%2F');
        const filenameParam = job.data.download_filename ? `&filename=${encodeURIComponent(job.data.download_filename)}` : '';
        const url = `${BACKEND_BASE_URL}/${REST_END_POINTS.DOWNLOADS}/${filePath}${filenameParam}`;

        downloadFile(url);

        setJobsIds(prev => prev.filter(jobId => jobId !== job.id));
        removeStoredJobId(job.id, userId);
      }

      if (nextStatus === 'failed') {
        showNotification({ id: `downloads-${job.id}`, title: 'Data export error', message: job.message ?? 'Please try again later' });
        setJobsIds(prev => prev.filter(jobId => jobId !== job.id));
        removeStoredJobId(job.id, userId);
      }

      // job removed in another tab
      if (nextStatus === 'cancelled') {
        setJobsIds(prev => prev.filter(jobId => jobId !== job.id));
        removeStoredJobId(job.id, userId); // if removed from another tab this should be already cleared, but just to be on the safe side
      }

      prevStatusRef.current[job.id] = nextStatus;
    });
  }, [jobsData, showNotification, userId]);

  const value = useMemo(
    () => ({ downloads, startDownload, cancelDownload, isOpened, setIsOpened }),
    [downloads, startDownload, cancelDownload, isOpened],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
};
