import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import type { AsyncJob } from 'types/jobs';
import { useApiQueries } from './useApiQueries';
import { REST_END_POINTS } from '../configuration/api';

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

export function useJobsQueries(jobIds: string[]) {
  return useApiQueries<AsyncJob>(
    jobIds.map(jobId => ({
      endpoint: `/${REST_END_POINTS.JOBS}/${jobId}`,
      method: 'GET',
      queryKey: ['jobs', jobId],
      enabled: true,
      refetchInterval: query => {
        const job = query.state.data;
        const done = job?.status === 'completed' || job?.status === 'failed';
        return done ? false : POLL_MS;
      },
    })),
  );
}

export function useCreateJobMutation() {
  return useApiMutation<{ id: string }, unknown>({
    endpoint: `/${REST_END_POINTS.JOBS}`,
    method: 'POST',
  });
}

export function useCancelJobMutation() {
  return useApiMutation<void, { jobId: string }>({
    endpoint: ({ jobId }) => `/${REST_END_POINTS.JOBS}/${jobId}`,
    method: 'DELETE',
  });
}

export function useInitialJobsQuery(enabled: boolean) {
  return useApiQuery<AsyncJob[]>({
    endpoint: `/${REST_END_POINTS.JOBS}`,
    method: 'GET',
    queryKey: ['jobs', 'initial'],
    enabled,
    refetchInterval: false,
  });
}
