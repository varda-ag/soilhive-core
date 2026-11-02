import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import type { AsyncJob } from 'types/jobs';
import { useApiQueries } from './useApiQueries';
import { REST_END_POINTS } from '../configuration/api';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';

const POLL_MS = 2000;

export function useJobsListQuery() {
  return useApiQuery<AsyncJob[]>({
    endpoint: `/${REST_END_POINTS.JOBS}`,
    method: 'GET',
    queryKey: ['jobs'],
    enabled: true,
  });
}

export function useJobQuery(jobId: string, enabled = true) {
  return useApiQuery<AsyncJob>({
    endpoint: `/${REST_END_POINTS.JOBS}/${jobId}`,
    method: 'GET',
    queryKey: ['jobs', jobId],
    enabled,
  });
}

// A job the backend no longer knows resolves to null, without a notification.
export function useJobsQueries(jobIds: string[]) {
  return useApiQueries<AsyncJob | null>(
    jobIds.map(jobId => ({
      endpoint: `/${REST_END_POINTS.JOBS}/${jobId}`,
      method: 'GET',
      queryKey: ['jobs', jobId],
      enabled: true,
      showErrorNotification: false,
      notFoundAsNull: true,
      refetchInterval: query => {
        const job = query.state.data;
        const done = job === null || job?.status === 'completed' || job?.status === 'failed';
        return done ? false : POLL_MS;
      },
    })),
  );
}

// Fetches a job past the cache, e.g. for a freshly signed download_path. Null when the job is gone.
export function useFetchJob() {
  const queryClient = useQueryClient();
  const { request } = useRequest<AsyncJob | null>();

  return useCallback(
    (jobId: string) =>
      queryClient.fetchQuery({
        queryKey: ['jobs', jobId],
        queryFn: () =>
          request({
            url: buildApiUrl(`/${REST_END_POINTS.JOBS}/${jobId}`),
            method: 'GET',
            showErrorNotification: false,
            notFoundAsNull: true,
          }),
        staleTime: 0,
      }),
    [queryClient, request],
  );
}

export function useCreateJobMutation({ showErrorNotification }: { showErrorNotification?: boolean } = {}) {
  return useApiMutation<{ id: string }, unknown>({
    endpoint: `/${REST_END_POINTS.JOBS}`,
    method: 'POST',
    showErrorNotification,
  });
}

export function useCancelJobMutation() {
  return useApiMutation<void, { jobId: string }>({
    endpoint: ({ jobId }) => `/${REST_END_POINTS.JOBS}/${jobId}`,
    method: 'DELETE',
  });
}
