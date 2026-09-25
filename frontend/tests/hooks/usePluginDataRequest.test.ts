import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import {
  dataRequestQueryKey,
  usePluginDataRequest,
  usePluginDataRequestDelete,
  usePluginDataRequestSubmit,
} from 'hooks/usePluginDataRequest';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));

const setQueryData = jest.fn();
const invalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ setQueryData, invalidateQueries })),
}));

const useApiQueryMock = useApiQuery as jest.Mock;
const useApiMutationMock = useApiMutation as jest.Mock;

const response = (status: string) => ({
  id: 'dr-1',
  status,
  created_at: '2026-09-25T10:00:00Z',
  completed_at: null,
  message: null,
  request: { statistics_type: 'value-range', filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] },
});

// The options usePluginDataRequest passed to useApiQuery on its last render.
const queryOptions = () => useApiQueryMock.mock.calls[useApiQueryMock.mock.calls.length - 1][0];
const queryState = (data: unknown, error: unknown = null) => ({ state: { data, error } });

describe('usePluginDataRequest', () => {
  beforeEach(() => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads the Data Request by id, cached forever and without the global error toast', () => {
    renderHook(() => usePluginDataRequest('dr-1'));

    expect(queryOptions()).toMatchObject({
      endpoint: '/data-requests/dr-1',
      method: 'GET',
      queryKey: dataRequestQueryKey('dr-1'),
      enabled: true,
      staleTime: Infinity,
      showErrorNotification: false,
    });
  });

  it('does not fetch without an id', () => {
    renderHook(() => usePluginDataRequest(undefined));

    expect(queryOptions().enabled).toBe(false);
  });

  it('polls until the request completes or fails, and stops on a lost or forbidden one', () => {
    renderHook(() => usePluginDataRequest('dr-1'));
    const { refetchInterval } = queryOptions();

    expect(refetchInterval(queryState(response('pending')))).toBe(2000);
    expect(refetchInterval(queryState(response('running')))).toBe(2000);
    expect(refetchInterval(queryState(response('completed')))).toBe(false);
    expect(refetchInterval(queryState(response('failed')))).toBe(false);
    expect(refetchInterval(queryState(undefined, { status: 404 }))).toBe(false);
    expect(refetchInterval(queryState(undefined, { status: 403 }))).toBe(false);
    expect(refetchInterval(queryState(response('running'), { status: 500 }))).toBe(2000);
  });

  it('retries only an unavailable backend', () => {
    renderHook(() => usePluginDataRequest('dr-1'));
    const { retry } = queryOptions();

    expect(retry(0, { status: 404 })).toBe(false);
    expect(retry(0, { status: 403 })).toBe(false);
    expect(retry(0, { status: 401 })).toBe(false);
    expect(retry(0, { status: 500 })).toBe(true);
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(3, { status: 500 })).toBe(false);
  });

  it('copies statistics_type to the top level, so plugins can narrow on it', () => {
    useApiQueryMock.mockReturnValue({ data: response('completed'), isLoading: false, error: null });

    const { result } = renderHook(() => usePluginDataRequest('dr-1'));

    expect(result.current.data?.statistics_type).toBe('value-range');
    expect(result.current.error).toBeUndefined();
    expect(result.current.isError).toBe(false);
  });

  it('reports a 404 as lost and drops the data', () => {
    useApiQueryMock.mockReturnValue({ data: response('completed'), isLoading: false, error: { status: 404, message: 'gone' } });

    const { result } = renderHook(() => usePluginDataRequest('dr-1'));

    expect(result.current.error).toEqual({ kind: 'lost', message: 'gone' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });

  it('reports a 403 as forbidden and drops the data', () => {
    useApiQueryMock.mockReturnValue({ data: response('completed'), isLoading: false, error: { status: 403, message: 'no read' } });

    const { result } = renderHook(() => usePluginDataRequest('dr-1'));

    expect(result.current.error?.kind).toBe('forbidden');
    expect(result.current.data).toBeUndefined();
  });

  it('reports a server error as unavailable and keeps the last data', () => {
    useApiQueryMock.mockReturnValue({ data: response('running'), isLoading: false, error: { status: 502, message: 'bad gateway' } });

    const { result } = renderHook(() => usePluginDataRequest('dr-1'));

    expect(result.current.error?.kind).toBe('unavailable');
    expect(result.current.data?.id).toBe('dr-1');
  });

  it('does not treat a failed Run as an error', () => {
    useApiQueryMock.mockReturnValue({ data: { ...response('failed'), message: 'Too many areas' }, isLoading: false, error: null });

    const { result } = renderHook(() => usePluginDataRequest('dr-1'));

    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.status).toBe('failed');
    expect(result.current.data?.message).toBe('Too many areas');
  });
});

describe('usePluginDataRequestSubmit', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    useApiMutationMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    mutateAsync.mockResolvedValue(response('pending'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('attaches the submission to the plugin config item and seeds the cache with the pending request', async () => {
    const { result } = renderHook(() => usePluginDataRequestSubmit('dashboards', 'd1'));
    const submission = {
      statistics_type: 'value-range' as const,
      filter_id: 'f',
      variable: { type: 'soil-property' as const, id: 'ph' },
      time_aggregation: 'none' as const,
    };

    const created = await result.current.mutateAsync(submission);

    expect(useApiMutationMock).toHaveBeenCalledWith({ endpoint: '/data-requests', method: 'POST', showErrorNotification: false });
    expect(mutateAsync).toHaveBeenCalledWith({ ...submission, config_id: 'plugin:dashboards:d1' });
    expect(setQueryData).toHaveBeenCalledWith(dataRequestQueryKey('dr-1'), response('pending'));
    expect(created.statistics_type).toBe('value-range');
  });

  it('lets a rejected submission reject', async () => {
    mutateAsync.mockRejectedValue({ status: 404, message: 'Config not found' });
    const { result } = renderHook(() => usePluginDataRequestSubmit('dashboards', 'd1'));

    await expect(
      result.current.mutateAsync({
        statistics_type: 'value-range',
        filter_id: 'f',
        variable: { type: 'soil-property', id: 'ph' },
        time_aggregation: 'none',
      }),
    ).rejects.toEqual({ status: 404, message: 'Config not found' });
    expect(setQueryData).not.toHaveBeenCalled();
  });
});

describe('usePluginDataRequestDelete', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    useApiMutationMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    mutateAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the request, then refetches it so every reader sees it as lost', async () => {
    const { result } = renderHook(() => usePluginDataRequestDelete());

    await result.current.mutateAsync({ id: 'dr-1' });

    const { endpoint, method } = useApiMutationMock.mock.calls[0][0];
    expect(method).toBe('DELETE');
    expect(endpoint({ id: 'dr-1' })).toBe('/data-requests/dr-1');
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'dr-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dataRequestQueryKey('dr-1') });
  });
});
