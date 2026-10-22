import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePluginSoilIndex, usePluginSoilIndexes } from 'hooks/usePluginSoilIndex';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));

const run = (id: string, status: string) => ({
  id,
  status,
  created_at: '2026-10-04T10:00:00Z',
  completed_at: null,
  message: null,
  request: { soil_index_type: 'crea-index', filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] },
});

// The backend's answer per Run id: a Run, or an error with an HTTP status.
let responses: Record<string, Array<ReturnType<typeof run> | { status: number; message: string }>> = {};
const request = jest.fn(async ({ url }: { url: string }) => {
  const id = url.split('/soil-indexes/')[1];
  const queue = responses[id];
  // The last answer repeats, so a poll after it reads the same state.
  const answer = queue.length > 1 ? queue.shift()! : queue[0];
  if ('id' in answer) {
    return answer;
  }
  throw answer;
});
const requestedIds = () => request.mock.calls.map(([{ url }]) => url.split('/soil-indexes/')[1]);

// A real QueryClient, shared across rerenders: the hooks' sharing and polling live in its cache.
const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('usePluginSoilIndexes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    responses = {};
    (useRequest as jest.Mock).mockReturnValue({ request });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('reads each Run with one GET and returns one entry per id', async () => {
    responses = { r1: [run('r1', 'completed')], r2: [run('r2', 'failed')] };

    const { result } = renderHook(() => usePluginSoilIndexes(['r1', 'r2']), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.r2?.data?.status).toBe('failed'));
    expect(result.current.r1).toMatchObject({ data: run('r1', 'completed'), isLoading: false, isError: false });
    expect(requestedIds()).toEqual(['r1', 'r2']);
  });

  it('reads nothing for an empty list, and a duplicate id once', async () => {
    responses = { r1: [run('r1', 'completed')] };

    const { result: empty } = renderHook(() => usePluginSoilIndexes([]), { wrapper: createWrapper() });
    expect(empty.current).toEqual({});

    const { result } = renderHook(() => usePluginSoilIndexes(['r1', 'r1']), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.r1?.data).toBeDefined());
    expect(Object.keys(result.current)).toEqual(['r1']);
    expect(requestedIds()).toEqual(['r1']);
  });

  it('polls a running Run every 2 s until it completes, then never reads it again', async () => {
    responses = { r1: [run('r1', 'running'), run('r1', 'completed')] };

    const { result, rerender } = renderHook(() => usePluginSoilIndexes(['r1']), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.r1?.data?.status).toBe('running'));

    await act(() => jest.advanceTimersByTimeAsync(2000));
    await waitFor(() => expect(result.current.r1?.data?.status).toBe('completed'));

    await act(() => jest.advanceTimersByTimeAsync(10000));
    rerender();
    expect(requestedIds()).toEqual(['r1', 'r1']);
  });

  it('reports a 404 as lost and a 403 as forbidden without data, leaving the other entries alone', async () => {
    responses = { lost: [{ status: 404, message: 'gone' }], denied: [{ status: 403, message: 'no read' }], ok: [run('ok', 'completed')] };

    const { result } = renderHook(() => usePluginSoilIndexes(['lost', 'denied', 'ok']), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.denied?.isError).toBe(true));
    await waitFor(() => expect(result.current.lost?.isError).toBe(true));
    expect(result.current.lost).toMatchObject({ data: undefined, error: { kind: 'lost' } });
    expect(result.current.denied).toMatchObject({ data: undefined, error: { kind: 'forbidden' } });
    expect(result.current.ok).toMatchObject({ data: run('ok', 'completed'), isError: false });
    // A permanent error is not retried.
    expect(requestedIds().filter(id => id !== 'ok')).toHaveLength(2);
  });

  it('retries an unavailable Run and keeps its last data', async () => {
    responses = { r1: [run('r1', 'running'), { status: 502, message: 'bad gateway' }] };

    const { result } = renderHook(() => usePluginSoilIndexes(['r1']), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.r1?.data?.status).toBe('running'));

    await act(() => jest.advanceTimersByTimeAsync(20000));

    await waitFor(() => expect(result.current.r1?.error?.kind).toBe('unavailable'));
    expect(result.current.r1?.data?.status).toBe('running');
    // The first read, then the poll plus its retries.
    expect(requestedIds().length).toBeGreaterThan(2);
  });

  it('shares one request with usePluginSoilIndex for the same id', async () => {
    responses = { r1: [run('r1', 'completed')] };

    const { result } = renderHook(() => ({ row: usePluginSoilIndex('r1'), list: usePluginSoilIndexes(['r1']) }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.list.r1?.data).toBeDefined());
    expect(result.current.row.data).toEqual(result.current.list.r1?.data);
    expect(requestedIds()).toEqual(['r1']);
  });

  it('keeps the same record across rerenders with no new data', async () => {
    responses = { r1: [run('r1', 'completed')], r2: [run('r2', 'completed')] };

    const { result, rerender } = renderHook(() => usePluginSoilIndexes(['r1', 'r2']), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.r2?.data).toBeDefined());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
