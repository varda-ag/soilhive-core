import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import type { AsyncJob } from 'types/jobs';
import { useApiQueries } from './useApiQueries';

const POLL_MS = 2000;

export function useJobsListQuery() {
  return useApiQuery<AsyncJob[]>({
    endpoint: 'jobs',
    method: 'GET',
    queryKey: ['jobs'],
    enabled: true,
  });
}

export function useJobQuery(jobId: string, enabled = true) {
  return useApiQuery<AsyncJob>({
    endpoint: `jobs/${jobId}`,
    method: 'GET',
    queryKey: ['jobs', jobId],
    enabled,
  });
}

export function useJobsQueries(jobIds: string[]) {
  return useApiQueries<AsyncJob>(
    jobIds.map(jobId => ({
      endpoint: `/jobs/${jobId}`,
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
    endpoint: 'jobs',
    method: 'POST',
  });
}

export function useCancelJobMutation() {
  return useApiMutation<void, { jobId: string }>({
    endpoint: ({ jobId }) => `jobs/${jobId}`,
    method: 'DELETE',
  });
}
