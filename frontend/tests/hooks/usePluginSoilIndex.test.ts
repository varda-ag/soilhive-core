import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { soilIndexQueryKey, usePluginSoilIndex, usePluginSoilIndexDelete, usePluginSoilIndexSubmit } from 'hooks/usePluginSoilIndex';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));

const setQueryData = jest.fn();
const invalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ setQueryData, invalidateQueries })),
}));

const useApiQueryMock = useApiQuery as jest.Mock;
const useApiMutationMock = useApiMutation as jest.Mock;

const run = (status: string) => ({
  id: 'si-1',
  status,
  created_at: '2026-10-04T10:00:00Z',
  completed_at: null,
  message: null,
  request: { soil_index_type: 'crea-index', filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] },
});

// The options the hook passed to useApiQuery on its last render.
const queryOptions = () => useApiQueryMock.mock.calls[useApiQueryMock.mock.calls.length - 1][0];
const queryState = (data: unknown, error: unknown = null) => ({ state: { data, error } });

describe('usePluginSoilIndex', () => {
  beforeEach(() => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads the Run by id, cached forever and without the global error toast', () => {
    renderHook(() => usePluginSoilIndex('si-1'));

    expect(queryOptions()).toMatchObject({
      endpoint: '/soil-indexes/si-1',
      method: 'GET',
      queryKey: soilIndexQueryKey('si-1'),
      enabled: true,
      staleTime: Infinity,
      showErrorNotification: false,
    });
  });

  it('does not fetch without an id', () => {
    renderHook(() => usePluginSoilIndex(undefined));

    expect(queryOptions().enabled).toBe(false);
  });

  it('polls until the Run completes or fails, and stops on a lost or forbidden one', () => {
    renderHook(() => usePluginSoilIndex('si-1'));
    const { refetchInterval } = queryOptions();

    expect(refetchInterval(queryState(run('running')))).toBe(2000);
    expect(refetchInterval(queryState(run('completed')))).toBe(false);
    expect(refetchInterval(queryState(run('failed')))).toBe(false);
    expect(refetchInterval(queryState(undefined, { status: 404 }))).toBe(false);
    expect(refetchInterval(queryState(undefined, { status: 403 }))).toBe(false);
  });

  it('reports a 403 as forbidden and drops the data, but keeps it on a server error', () => {
    useApiQueryMock.mockReturnValue({ data: run('completed'), isLoading: false, error: { status: 403, message: 'no read' } });
    const { result: forbidden } = renderHook(() => usePluginSoilIndex('si-1'));
    expect(forbidden.current.error?.kind).toBe('forbidden');
    expect(forbidden.current.data).toBeUndefined();

    useApiQueryMock.mockReturnValue({ data: run('running'), isLoading: false, error: { status: 502, message: 'bad gateway' } });
    const { result: unavailable } = renderHook(() => usePluginSoilIndex('si-1'));
    expect(unavailable.current.error?.kind).toBe('unavailable');
    expect(unavailable.current.data?.id).toBe('si-1');
  });
});

describe('usePluginSoilIndexSubmit', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    useApiMutationMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    mutateAsync.mockResolvedValue(run('pending'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('attaches the Run to the plugin config item and seeds the cache with it pending', async () => {
    const { result } = renderHook(() => usePluginSoilIndexSubmit('dashboards', 'dashboards:d1'));
    const submission = { soil_index_type: 'crea-index' as const, filter_id: 'f' };

    await result.current.mutateAsync(submission);

    expect(useApiMutationMock).toHaveBeenCalledWith({ endpoint: '/soil-indexes', method: 'POST', showErrorNotification: false });
    expect(mutateAsync).toHaveBeenCalledWith({ ...submission, config_id: 'plugin:dashboards:dashboards:d1' });
    expect(setQueryData).toHaveBeenCalledWith(soilIndexQueryKey('si-1'), run('pending'));
  });
});

describe('usePluginSoilIndexDelete', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    useApiMutationMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    mutateAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the Run, treating one already gone as deleted, then refetches it and its tiles', async () => {
    const { result } = renderHook(() => usePluginSoilIndexDelete());

    await result.current.mutateAsync({ id: 'si-1' });

    const { endpoint, method, notFoundAsNull } = useApiMutationMock.mock.calls[0][0];
    expect(endpoint({ id: 'si-1' })).toBe('/soil-indexes/si-1');
    expect(method).toBe('DELETE');
    expect(notFoundAsNull).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: soilIndexQueryKey('si-1') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['soil-index-tiles', 'si-1'] });
  });
});
