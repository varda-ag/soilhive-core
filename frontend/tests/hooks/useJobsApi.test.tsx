import { useJobsListQuery, useJobQuery, useJobsQueries, useCreateJobMutation, useCancelJobMutation } from 'hooks/useJobsApi';

import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useApiQueries } from 'hooks/useApiQueries';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useApiMutation', () => ({
  useApiMutation: jest.fn(),
}));

jest.mock('hooks/useApiQueries', () => ({
  useApiQueries: jest.fn(),
}));

jest.mock('../../src/configuration/api', () => ({
  REST_END_POINTS: {
    JOBS: 'jobs',
  },
}));

describe('useJobsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useJobsListQuery', () => {
    it('calls useApiQuery with jobs list config', () => {
      const mockedResult = { data: [] };
      (useApiQuery as jest.Mock).mockReturnValue(mockedResult as ReturnType<typeof useApiQuery>);

      const result = useJobsListQuery();

      expect(useApiQuery).toHaveBeenCalledWith({
        endpoint: '/jobs',
        method: 'GET',
        queryKey: ['jobs'],
        enabled: true,
      });
      expect(result).toBe(mockedResult);
    });
  });

  describe('useJobQuery', () => {
    it('calls useApiQuery with job details config', () => {
      const mockedResult = { data: { id: '123' } };
      (useApiQuery as jest.Mock).mockReturnValue(mockedResult as ReturnType<typeof useApiQuery>);

      const result = useJobQuery('123');

      expect(useApiQuery).toHaveBeenCalledWith({
        endpoint: '/jobs/123',
        method: 'GET',
        queryKey: ['jobs', '123'],
        enabled: true,
      });
      expect(result).toBe(mockedResult);
    });

    it('passes custom enabled flag', () => {
      (useApiQuery as jest.Mock).mockReturnValue({} as ReturnType<typeof useApiQuery>);

      useJobQuery('123', false);

      expect(useApiQuery).toHaveBeenCalledWith({
        endpoint: '/jobs/123',
        method: 'GET',
        queryKey: ['jobs', '123'],
        enabled: false,
      });
    });
  });

  describe('useJobsQueries', () => {
    it('calls useApiQueries with one config per job id', () => {
      const mockedResult = [{ data: { id: '1' } }, { data: { id: '2' } }];
      (useApiQueries as jest.Mock).mockReturnValue(mockedResult);

      const result = useJobsQueries(['1', '2']);

      expect(useApiQueries).toHaveBeenCalledTimes(1);

      const arg = (useApiQueries as jest.Mock).mock.calls[0][0];

      expect(arg).toHaveLength(2);

      expect(arg[0]).toMatchObject({
        endpoint: '/jobs/1',
        method: 'GET',
        queryKey: ['jobs', '1'],
        enabled: true,
      });

      expect(arg[1]).toMatchObject({
        endpoint: '/jobs/2',
        method: 'GET',
        queryKey: ['jobs', '2'],
        enabled: true,
      });

      expect(typeof arg[0].refetchInterval).toBe('function');
      expect(typeof arg[1].refetchInterval).toBe('function');

      expect(result).toBe(mockedResult);
    });

    it('returns false from refetchInterval when job is completed', () => {
      (useApiQueries as jest.Mock).mockReturnValue([]);

      useJobsQueries(['1']);

      const arg = (useApiQueries as jest.Mock).mock.calls[0][0];
      const refetchInterval = arg[0].refetchInterval!;

      const result = refetchInterval({
        state: {
          data: {
            id: '1',
            status: 'completed',
          },
        },
      } as any);

      expect(result).toBe(false);
    });

    it('returns false from refetchInterval when job is failed', () => {
      (useApiQueries as jest.Mock).mockReturnValue([]);

      useJobsQueries(['1']);

      const arg = (useApiQueries as jest.Mock).mock.calls[0][0];
      const refetchInterval = arg[0].refetchInterval!;

      const result = refetchInterval({
        state: {
          data: {
            id: '1',
            status: 'failed',
          },
        },
      } as any);

      expect(result).toBe(false);
    });

    it('returns 2000 from refetchInterval when job is still active', () => {
      (useApiQueries as jest.Mock).mockReturnValue([]);

      useJobsQueries(['1']);

      const arg = (useApiQueries as jest.Mock).mock.calls[0][0];
      const refetchInterval = arg[0].refetchInterval!;

      const result = refetchInterval({
        state: {
          data: {
            id: '1',
            status: 'created',
          },
        },
      } as any);

      expect(result).toBe(2000);
    });
  });

  describe('useCreateJobMutation', () => {
    it('calls useApiMutation with create job config', () => {
      const mockedResult = { mutateAsync: jest.fn() };
      (useApiMutation as jest.Mock).mockReturnValue(mockedResult);

      const result = useCreateJobMutation();

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: '/jobs',
        method: 'POST',
      });
      expect(result).toBe(mockedResult);
    });
  });

  describe('useCancelJobMutation', () => {
    it('calls useApiMutation with cancel job config', () => {
      const mockedResult = { mutateAsync: jest.fn() };
      (useApiMutation as jest.Mock).mockReturnValue(mockedResult);

      const result = useCancelJobMutation();

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: expect.any(Function),
        method: 'DELETE',
      });
      expect(result).toBe(mockedResult);
    });

    it('builds dynamic endpoint for cancel job', () => {
      (useApiMutation as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });

      useCancelJobMutation();

      const arg = (useApiMutation as jest.Mock).mock.calls[0][0];
      const endpoint = arg.endpoint as ({ jobId }: { jobId: string }) => string;

      expect(endpoint({ jobId: '123' })).toBe('/jobs/123');
    });
  });
});
