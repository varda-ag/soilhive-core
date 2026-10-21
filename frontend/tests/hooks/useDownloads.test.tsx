import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useDownloads from 'hooks/useDownloads';
import { DownloadsProvider } from '../../src/contexts/DownloadsContext';
import { useCreateJobMutation, useCancelJobMutation, useFetchJob, useJobsQueries } from 'hooks/useJobsApi';
import useNotifications from 'hooks/useNotifications';
import { getStoredJobIds, addStoredJobId, removeStoredJobId, subscribeToStoredJobIds } from '../../src/utilities/downloadJobStorage';
import { downloadFile } from '../../src/utilities/download';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

// Clicking the generated <a> is a real navigation jsdom cannot perform; these
// tests only cover job tracking, not the browser download itself.
jest.mock('../../src/utilities/download', () => ({
  downloadFile: jest.fn(),
}));

jest.mock('../../src/utilities/downloadJobStorage', () => ({
  getStoredJobIds: jest.fn(),
  addStoredJobId: jest.fn(() => []),
  removeStoredJobId: jest.fn(),
  subscribeToStoredJobIds: jest.fn(() => () => {}),
}));

jest.mock('hooks/useJobsApi', () => ({
  useCreateJobMutation: jest.fn(),
  useCancelJobMutation: jest.fn(),
  useFetchJob: jest.fn(),
  useJobsQueries: jest.fn(),
}));

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'https://test.url',
  REST_END_POINTS: {
    DOWNLOADS: 'downloads',
  },
}));

const CREATED_AT = '2026-10-21T10:00:00.000Z';

const jobResponse = (id: string, status: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  created_at: CREATED_AT,
  data: { progress_percentage: 0, formats: ['csv'], dataset_ids: ['dataset-1'], ...data },
  ...extra,
});

// Answers every polled id with the status `statusOf` gives it.
const mockJobs = (statusOf: (id: string) => string, data: Record<string, unknown> = {}) =>
  (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => jobIds.map(id => ({ data: jobResponse(id, statusOf(id), data) })));

const PAYLOAD = { filter_id: 'filter-1', dataset_ids: ['dataset-1'], formats: ['csv'] };

describe('useDownloads', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <DownloadsProvider>{children}</DownloadsProvider>;
  const createMutateAsync = jest.fn();
  const cancelMutateAsync = jest.fn();
  const fetchJob = jest.fn();
  const showNotification = jest.fn();

  beforeEach(() => {
    (useCreateJobMutation as jest.Mock).mockReturnValue({
      mutateAsync: createMutateAsync,
    });

    (useCancelJobMutation as jest.Mock).mockReturnValue({
      mutateAsync: cancelMutateAsync,
    });

    (useFetchJob as jest.Mock).mockReturnValue(fetchJob);

    (useNotifications as jest.Mock).mockReturnValue({
      showNotification,
    });

    (useJobsQueries as jest.Mock).mockReturnValue([]);

    (getStoredJobIds as jest.Mock).mockReturnValue([]);

    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws if used outside DownloadsProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDownloads())).toThrow('useDownloads must be used within a DownloadsContext');
    spy.mockRestore();
  });

  it('returns context when used within provider', () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    expect(result.current).toHaveProperty('downloads');
    expect(result.current).toHaveProperty('startDownload');
    expect(result.current).toHaveProperty('cancelDownload');
    expect(result.current).toHaveProperty('downloadBundle');
    expect(result.current).toHaveProperty('removeDownload');
    expect(result.current).toHaveProperty('clearFinished');
    expect(Array.isArray(result.current.downloads)).toBe(true);
  });

  it('starts download and tracks active job', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    mockJobs(() => 'created', { progress_percentage: 25 });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    expect(createMutateAsync).toHaveBeenCalledWith({
      filter_id: 'filter-1',
      dataset_ids: ['dataset-1'],
      formats: ['csv'],
      public_homepage_url: 'http://localhost',
      public_metadata_urls: {
        'dataset-1': 'http://localhost/datasets/dataset-1',
      },
      public_terms_url: 'http://localhost/terms-of-use',
      type: 'export',
      anonymous: true,
    });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([
        {
          id: 'job-1',
          status: 'created',
          progress: 25,
          createdAt: CREATED_AT,
          formats: ['csv'],
          datasetCount: 1,
        },
      ]);
    });
  });

  it('sets precentage 0 if progress_presentage is undefined ', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    mockJobs(() => 'created', { progress_percentage: undefined });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(1);
    });
    expect(result.current.downloads[0].progress).toBe(0);
  });

  it('lists the newest Export first', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-old', 'job-new']);
    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) =>
      jobIds.map(id => ({
        data: jobResponse(id, 'completed', {}, { created_at: id === 'job-new' ? '2026-10-21T12:00:00.000Z' : CREATED_AT }),
      })),
    );

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads.map(item => item.id)).toEqual(['job-new', 'job-old']);
    });
  });

  it('keeps completed jobs in the downloads list and in storage', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    mockJobs(() => 'completed', { progress_percentage: 100, download_path: 'exports/file.zip?token=abc' });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([expect.objectContaining({ id: 'job-1', status: 'completed' })]);
    });
    expect(removeStoredJobId).not.toHaveBeenCalled();
  });

  it('downloads the bundle once when an Export started in this tab completes', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    let status = 'active';
    mockJobs(() => status, { download_path: 'exports/file.zip?token=abc', download_filename: 'SoilHive.zip' });

    const { result, rerender } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });
    expect(downloadFile).not.toHaveBeenCalled();

    status = 'completed';
    rerender();

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledWith('https://test.url/downloads/exports%2Ffile.zip?token=abc&filename=SoilHive.zip');
    });

    rerender();
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('shows notification when job started in this tab fails and keeps it with its message', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) =>
      jobIds.map(id => ({ data: jobResponse(id, 'failed', { progress_percentage: 80 }, { message: 'Too many records.' }) })),
    );

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith({
        id: 'downloads-job-1',
        title: 'Data export error',
        message: 'Too many records.',
      });
    });

    expect(result.current.downloads).toEqual([expect.objectContaining({ id: 'job-1', status: 'failed', message: 'Too many records.' })]);
  });

  it('does not trigger failed notification twice for same failed status', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    mockJobs(() => 'failed', { progress_percentage: 80 });

    const { result, rerender } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    rerender();

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('neither downloads nor notifies for stored Exports that finished before this tab saw them', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-done', 'job-failed']);
    mockJobs(id => (id === 'job-done' ? 'completed' : 'failed'), { download_path: 'exports/file.zip?token=abc' });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(2);
    });
    expect(downloadFile).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('cancels download and removes it from tracked jobs', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    cancelMutateAsync.mockResolvedValue(undefined);
    mockJobs(() => 'created', { progress_percentage: 40 });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload(PAYLOAD);
    });

    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(1);
    });

    await act(async () => {
      await result.current.cancelDownload('job-1');
    });

    expect(cancelMutateAsync).toHaveBeenCalledWith({ jobId: 'job-1' });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([]);
    });
  });

  it('persists downloads when the hook is re-rendered or reopened', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-existing']);
    mockJobs(() => 'active', { progress_percentage: 50 });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([expect.objectContaining({ id: 'job-existing', status: 'active', progress: 50 })]);
    });
  });

  it('saves the job ID to storage when a download starts', async () => {
    const jobId = 'job-123';
    createMutateAsync.mockResolvedValue({ id: jobId });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      result.current.startDownload(PAYLOAD);
    });

    expect(addStoredJobId).toHaveBeenCalledWith(jobId, null);
  });

  it('deletes the job ID from the storage when a download is cancelled', async () => {
    const jobId = 'job-123';
    createMutateAsync.mockResolvedValue({ id: jobId });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      result.current.cancelDownload(jobId);
    });

    expect(removeStoredJobId).toHaveBeenCalledWith(jobId, null);
  });

  it('removes job from state if it was cancelled in another tab/externally', async () => {
    const jobId = 'external-cancel-job';
    (getStoredJobIds as jest.Mock).mockReturnValue([jobId]);
    mockJobs(() => 'cancelled');

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(removeStoredJobId).toHaveBeenCalledWith(jobId, null);
    });
    expect(result.current.downloads).toHaveLength(0);
  });

  it('forgets jobs the backend no longer knows', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-gone', 'job-1']);
    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) =>
      jobIds.map(id => ({ data: id === 'job-gone' ? null : jobResponse(id, 'completed') })),
    );

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(removeStoredJobId).toHaveBeenCalledWith('job-gone', null);
    });
    expect(removeStoredJobId).not.toHaveBeenCalledWith('job-1', null);
    expect(result.current.downloads.map(item => item.id)).toEqual(['job-1']);
  });

  it('removes a single finished Export without cancelling anything', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-1']);
    mockJobs(() => 'completed');

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(1);
    });

    act(() => {
      result.current.removeDownload('job-1');
    });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([]);
    });
    expect(removeStoredJobId).toHaveBeenCalledWith('job-1', null);
    expect(cancelMutateAsync).not.toHaveBeenCalled();
  });

  it('clears completed and failed Exports but keeps running ones', async () => {
    const statuses: Record<string, string> = { 'job-running': 'active', 'job-done': 'completed', 'job-failed': 'failed' };
    (getStoredJobIds as jest.Mock).mockReturnValue(Object.keys(statuses));
    mockJobs(id => statuses[id]);

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(3);
    });

    act(() => {
      result.current.clearFinished();
    });

    await waitFor(() => {
      expect(result.current.downloads.map(item => item.id)).toEqual(['job-running']);
    });
    expect(removeStoredJobId).toHaveBeenCalledWith('job-done', null);
    expect(removeStoredJobId).toHaveBeenCalledWith('job-failed', null);
    expect(removeStoredJobId).not.toHaveBeenCalledWith('job-running', null);
    expect(cancelMutateAsync).not.toHaveBeenCalled();
  });

  it('downloads a finished bundle again from a freshly fetched job', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-1']);
    mockJobs(() => 'completed', { download_path: 'exports/file.zip?token=stale' });
    fetchJob.mockResolvedValue(jobResponse('job-1', 'completed', { download_path: 'exports/file.zip?token=fresh' }));

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.downloadBundle('job-1');
    });

    expect(fetchJob).toHaveBeenCalledWith('job-1');
    expect(downloadFile).toHaveBeenCalledWith('https://test.url/downloads/exports%2Ffile.zip?token=fresh');
  });

  it('forgets an Export and warns when its bundle is no longer available', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-1']);
    mockJobs(() => 'completed', { download_path: 'exports/file.zip?token=stale' });
    fetchJob.mockResolvedValue(null);

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.downloadBundle('job-1');
    });

    expect(downloadFile).not.toHaveBeenCalled();
    expect(removeStoredJobId).toHaveBeenCalledWith('job-1', null);
    expect(showNotification).toHaveBeenCalledWith({
      id: 'downloads-job-1',
      type: 'warning',
      title: 'Export no longer available',
      message: 'This export has expired. Please export the data again.',
    });
  });

  it('notifies and keeps the Export when fetching it for a download fails', async () => {
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-1']);
    mockJobs(() => 'completed');
    fetchJob.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.downloadBundle('job-1');
    });

    expect(downloadFile).not.toHaveBeenCalled();
    expect(removeStoredJobId).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith({
      id: 'downloads-job-1',
      title: 'Download failed',
      message: 'Please try again later',
    });
  });

  it('follows stored ids changed by another tab', async () => {
    let onStorageChange: () => void = () => {};
    (subscribeToStoredJobIds as jest.Mock).mockImplementation((callback: () => void) => {
      onStorageChange = callback;
      return () => {};
    });
    mockJobs(() => 'completed', { download_path: 'exports/file.zip?token=abc' });

    const { result } = renderHook(() => useDownloads(), { wrapper });
    expect(result.current.downloads).toEqual([]);

    (getStoredJobIds as jest.Mock).mockReturnValue(['job-other-tab']);
    act(() => {
      onStorageChange();
    });

    await waitFor(() => {
      expect(result.current.downloads.map(item => item.id)).toEqual(['job-other-tab']);
    });
    // Started in the other tab, which downloads it: this one must not
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('starts persisted downloads for current logged in user', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      user: {
        profile: {
          sub: 'mockUserId',
        },
      },
    });

    (getStoredJobIds as jest.Mock).mockReturnValue(['job-existing']);
    mockJobs(() => 'active', { progress_percentage: 50 });

    renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(getStoredJobIds as jest.Mock).toHaveBeenCalledWith('mockUserId');
      expect(useJobsQueries as jest.Mock).toHaveBeenCalledWith(['job-existing']);
    });
  });
});
