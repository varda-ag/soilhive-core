import { useCancelJobMutation, useCreateJobMutation, useFetchJob, useJobsQueries } from 'hooks/useJobsApi';
import React, { createContext, useState, type ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isJobFinished, type AsyncJob, type AsyncJobStatus } from 'types/jobs';
import useNotifications from 'hooks/useNotifications';
import { BACKEND_BASE_URL, REST_END_POINTS } from '../configuration/api';
import { appBaseUrl, appUrl, metadataUrl, TERMS_OF_USE_ROUTE } from '../configuration/routes';
import { addStoredJobId, getStoredJobIds, removeStoredJobId, subscribeToStoredJobIds } from '../utilities/downloadJobStorage';
import { downloadFile } from '../utilities/download';
import { useAuthContext } from '../auth/AuthContextProvider';

export type DownloadsItem = {
  id: string;
  status: AsyncJobStatus;
  progress: number;
  createdAt: string;
  formats: string[];
  datasetCount: number;
  message?: string;
};

type DownloadsContextType = {
  downloads: DownloadsItem[];
  startDownload: (payload: { filter_id: string; dataset_ids: string[]; formats: string[] }) => void;
  cancelDownload: (id: string) => void;
  downloadBundle: (id: string) => Promise<void>;
  removeDownload: (id: string) => void;
  clearFinished: () => void;
  isOpened: boolean;
  setIsOpened: (value: boolean) => void;
};

const bundleUrl = (job: AsyncJob): string | null => {
  if (!job.data.download_path) return null;
  const filePath = job.data.download_path.replace(/\//g, '%2F');
  const filenameParam = job.data.download_filename ? `&filename=${encodeURIComponent(job.data.download_filename)}` : '';
  return `${BACKEND_BASE_URL}/${REST_END_POINTS.DOWNLOADS}/${filePath}${filenameParam}`;
};

export const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

type DownloadsProviderProps = {
  children: ReactNode;
};

export const DownloadsProvider: React.FC<DownloadsProviderProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuthContext();
  const [jobsIds, setJobsIds] = useState<string[]>([]);
  const [isOpened, setIsOpened] = useState(false);
  // Only Exports started in this tab download or toast on their own, so other tabs and reloads never repeat it.
  const startedHereRef = useRef<Set<string>>(new Set());
  const createJob = useCreateJobMutation();
  const cancelJob = useCancelJobMutation();
  const fetchJob = useFetchJob();
  const { t } = useTranslation('download');

  const { showNotification } = useNotifications();

  const userId = useMemo((): string | null => (isAuthenticated ? user?.profile?.sub || null : null), [isAuthenticated, user]);

  // Load stored jobs, and follow changes other tabs make to them
  useEffect(() => {
    setJobsIds(getStoredJobIds(userId));
    return subscribeToStoredJobIds(() => setJobsIds(getStoredJobIds(userId)));
  }, [userId]);

  const forget = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      setJobsIds(prev => (prev.some(jobId => ids.includes(jobId)) ? prev.filter(jobId => !ids.includes(jobId)) : prev));
      ids.forEach(id => {
        startedHereRef.current.delete(id);
        removeStoredJobId(id, userId);
      });
    },
    [userId],
  );

  const jobsQueries = useJobsQueries(jobsIds);

  const jobsData = useMemo(() => jobsQueries.map(query => query.data).filter((job): job is AsyncJob => !!job), [jobsQueries]);

  const downloads = useMemo(() => {
    return jobsData
      .filter(job => job.status !== 'cancelled')
      .map(job => ({
        id: job.id,
        status: job.status,
        progress: job.data?.progress_percentage ?? 0,
        createdAt: job.created_at,
        formats: job.data?.formats ?? [],
        datasetCount: job.data?.dataset_ids?.length ?? 0,
        message: job.message,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [jobsData]);

  // Forget jobs the backend deleted (null) or that were cancelled in another tab
  useEffect(() => {
    const deleted = jobsIds.filter((_, index) => jobsQueries[index]?.data === null);
    const cancelled = jobsData.filter(job => job.status === 'cancelled' && jobsIds.includes(job.id)).map(job => job.id);
    forget([...deleted, ...cancelled]);
  }, [jobsIds, jobsQueries, jobsData, forget]);

  const startDownload = useCallback(
    async (payload: { filter_id: string; dataset_ids: string[]; formats: string[] }) => {
      const public_metadata_urls: Record<string, string> = {};
      payload.dataset_ids.forEach(id => {
        public_metadata_urls[id] = metadataUrl(id);
      });
      const res = await createJob.mutateAsync({
        ...payload,
        type: 'export',
        anonymous: true,
        public_homepage_url: appBaseUrl(),
        public_terms_url: appUrl(TERMS_OF_USE_ROUTE),
        public_metadata_urls,
      });

      startedHereRef.current.add(res.id);
      setJobsIds(prev => [...prev, res.id]);

      addStoredJobId(res.id, userId);

      return res.id;
    },
    [createJob, userId],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      await cancelJob.mutateAsync({ jobId: id });
      forget([id]);
    },
    [cancelJob, forget],
  );

  const downloadBundle = useCallback(
    async (id: string) => {
      // The cached download_path is signed for 30 seconds only, so fetch a fresh one.
      let job: AsyncJob | null;
      try {
        job = await fetchJob(id);
      } catch {
        showNotification({
          id: `downloads-${id}`,
          title: t('downloads_status.download_failed_title'),
          message: t('downloads_status.download_failed_message'),
        });
        return;
      }

      if (!job) {
        forget([id]);
        showNotification({
          id: `downloads-${id}`,
          type: 'warning',
          title: t('downloads_status.unavailable_title'),
          message: t('downloads_status.unavailable_message'),
        });
        return;
      }

      const url = bundleUrl(job);
      if (url) downloadFile(url);
    },
    [fetchJob, forget, showNotification, t],
  );

  const removeDownload = useCallback((id: string) => forget([id]), [forget]);

  const clearFinished = useCallback(
    () => forget(downloads.filter(item => isJobFinished(item.status)).map(item => item.id)),
    [downloads, forget],
  );

  useEffect(() => {
    jobsData.forEach(job => {
      if (!startedHereRef.current.has(job.id) || !isJobFinished(job.status)) return;
      startedHereRef.current.delete(job.id);

      if (job.status === 'completed') {
        const url = bundleUrl(job);
        if (url) downloadFile(url);
      } else {
        showNotification({ id: `downloads-${job.id}`, title: 'Data export error', message: job.message ?? 'Please try again later' });
      }
    });
  }, [jobsData, showNotification]);

  const value = useMemo(
    () => ({ downloads, startDownload, cancelDownload, downloadBundle, removeDownload, clearFinished, isOpened, setIsOpened }),
    [downloads, startDownload, cancelDownload, downloadBundle, removeDownload, clearFinished, isOpened],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
};
