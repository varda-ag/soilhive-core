import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useDownloads from 'hooks/useDownloads';
import { DownloadsProvider } from '../../src/contexts/DownloadsContext';
import { useCreateJobMutation, useCancelJobMutation, useJobsQueries } from 'hooks/useJobsApi';
import useNotifications from 'hooks/useNotifications';
import { getStoredJobIds, addStoredJobId, removeStoredJobId } from '../../src/utilities/downloadJobStorage';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('../../src/utilities/downloadJobStorage', () => ({
  getStoredJobIds: jest.fn(),
  addStoredJobId: jest.fn(() => []),
  removeStoredJobId: jest.fn(),
}));

jest.mock('hooks/useJobsApi', () => ({
  useCreateJobMutation: jest.fn(),
  useCancelJobMutation: jest.fn(),
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

describe('useDownloads', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <DownloadsProvider>{children}</DownloadsProvider>;
  const createMutateAsync = jest.fn();
  const cancelMutateAsync = jest.fn();
  const showNotification = jest.fn();

  beforeEach(() => {
    (useCreateJobMutation as jest.Mock).mockReturnValue({
      mutateAsync: createMutateAsync,
    });

    (useCancelJobMutation as jest.Mock).mockReturnValue({
      mutateAsync: cancelMutateAsync,
    });

    (useNotifications as jest.Mock).mockReturnValue({
      showNotification,
    });

    (useJobsQueries as jest.Mock).mockReturnValue([]);

    (getStoredJobIds as jest.Mock).mockReturnValue([]);

    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: true,
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
    expect(Array.isArray(result.current.downloads)).toBe(true);
  });

  it('starts download and tracks active job', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'created',
          data: {
            progress_percentage: 25,
          },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
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
        },
      ]);
    });
  });

  it('sets precentage 0 if progress_presentage is undefined ', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'created',
          data: {
            progress_percentage: undefined,
          },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
    });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([
        {
          id: 'job-1',
          status: 'created',
          progress: 0,
        },
      ]);
    });
  });

  it('hides completed jobs from downloads list', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'completed',
          data: {
            progress_percentage: 100,
            download_path: 'exports/file.zip?token=abc',
          },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
    });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([]);
    });
  });

  it('shows notification when job fails and hides it from downloads list', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'failed',
          data: {
            progress_percentage: 80,
          },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith({
        id: 'downloads-job-1',
        title: 'Data export error',
        message: 'Please try again later',
      });
    });

    expect(result.current.downloads).toEqual([]);
  });

  it('cancels download and removes it from tracked jobs', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });
    cancelMutateAsync.mockResolvedValue(undefined);

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'created',
          data: {
            progress_percentage: 40,
          },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
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

  it('does not trigger failed notification twice for same failed status', async () => {
    createMutateAsync.mockResolvedValue({ id: 'job-1' });

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'failed',
          data: {
            progress_percentage: 80,
          },
        },
      }));
    });

    const { result, rerender } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    rerender();

    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('persists downloads when the hook is re-rendered or reopened', async () => {
    // Mock storage to already contain an ID
    (getStoredJobIds as jest.Mock).mockReturnValue(['job-existing']);

    // Mock the query to return data for that existing ID
    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'running',
          data: { progress_percentage: 50 },
        },
      }));
    });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads).toEqual([
        {
          id: 'job-existing',
          status: 'running',
          progress: 50,
        },
      ]);
    });
  });

  it('saves the job ID to storage when a download starts', async () => {
    const jobId = 'job-123';
    createMutateAsync.mockResolvedValue({ id: jobId });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      result.current.startDownload({
        filter_id: 'filter-1',
        dataset_ids: ['dataset-1'],
        formats: ['csv'],
      });
    });

    // Verify that the utility function was called with the new ID
    expect(addStoredJobId).toHaveBeenCalledWith(jobId);
  });

  it('deletes the job ID from the storage when a download is cancelled', async () => {
    const jobId = 'job-123';
    createMutateAsync.mockResolvedValue({ id: jobId });

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      result.current.cancelDownload(jobId);
    });

    // Verify that the utility function was called with the new ID
    expect(removeStoredJobId).toHaveBeenCalledWith(jobId);
  });

  it.each(['completed', 'failed'])(`automatically removes the job ID from storage when status is %s`, async (status: string) => {
    const jobId = 'job-id';
    createMutateAsync.mockResolvedValue({ id: jobId });

    // Mock the query to return selected status
    (useJobsQueries as jest.Mock).mockImplementation(() => [
      {
        data: {
          id: jobId,
          status: status,
          data: { download_path: 'file.zip' },
        },
      },
    ]);

    renderHook(() => useDownloads(), { wrapper });

    // We wait for the useEffect inside the component to trigger the removal
    await waitFor(() => {
      expect(removeStoredJobId).toHaveBeenCalledWith(jobId);
    });
  });

  it('removes job from state if it was cancelled in another tab/externally', async () => {
    const jobId = 'external-cancel-job';

    // Start with the job already in the stored IDs
    (getStoredJobIds as jest.Mock).mockReturnValue([jobId]);

    // Mock the query to return 'cancelled' status
    (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) =>
      ids.map(id => ({
        data: {
          id,
          status: 'cancelled',
          data: {},
        },
      })),
    );

    const { result } = renderHook(() => useDownloads(), { wrapper });

    // The job should be filtered out of the internal state
    // and result in an empty downloads list
    await waitFor(() => {
      expect(result.current.downloads).toHaveLength(0);
    });
  });

  it('does not start persisted downloads for not logged in user', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      isAuthenticated: false,
    });

    (getStoredJobIds as jest.Mock).mockReturnValue(['job-existing']);

    (useJobsQueries as jest.Mock).mockImplementation((jobIds: string[]) => {
      return jobIds.map(id => ({
        data: {
          id,
          status: 'running',
          data: { progress_percentage: 50 },
        },
      }));
    });

    renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(useJobsQueries as jest.Mock).toHaveBeenCalledWith([]);
    });
  });
});
