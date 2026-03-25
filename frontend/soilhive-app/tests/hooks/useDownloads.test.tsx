import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import useDownloads from 'hooks/useDownloads';
import { DownloadsProvider } from '../../src/contexts/DownloadsContext';
import { useCreateJobMutation, useCancelJobMutation, useJobsQueries } from 'hooks/useJobsApi';
import useNotifications from 'hooks/useNotifications';
import { getStoredJobIds } from '../../src/utilities/downloadJobStorage';

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
        format: 'csv',
      });
    });

    expect(createMutateAsync).toHaveBeenCalledWith({
      filter_id: 'filter-1',
      dataset_ids: ['dataset-1'],
      format: 'csv',
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
        format: 'csv',
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
        format: 'csv',
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
        format: 'csv',
      });
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith({
        id: 'downloads-job-1',
        title: 'Extracting data error',
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
        format: 'csv',
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
        format: 'csv',
      });
    });

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    rerender();

    expect(showNotification).toHaveBeenCalledTimes(1);
  });
});
