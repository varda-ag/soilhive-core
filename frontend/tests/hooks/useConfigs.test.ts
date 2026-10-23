import { renderHook } from '@testing-library/react';
import { useApiQueries } from 'hooks/useApiQueries';
import useConfigs from 'hooks/useConfigs';

jest.mock('hooks/useApiQueries', () => ({ useApiQueries: jest.fn() }));

const useApiQueriesMock = useApiQueries as jest.Mock;

const updatedAt = '2026-10-23T07:59:52.473Z';
const earlierUpdatedAt = '2026-10-22T10:00:00.000Z';
// Runs useConfigs' combine on the given per-batch results, as React Query does.
const mockResults = (results: unknown[]) =>
  useApiQueriesMock.mockImplementation((_queries, combine: (r: unknown[]) => unknown) => combine(results));

const ids = (count: number) => Array.from({ length: count }, (_, i) => `id-${i}`);
const configsFor = (chunk: string[]) => Object.fromEntries(chunk.map(id => [id, { data: { id }, updated_at: updatedAt }]));
const queriesPassed = () => useApiQueriesMock.mock.calls[0][0];

describe('useConfigs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches /configs with comma-separated ids and returns the resolved data', () => {
    const data = {
      a: { data: { foo: 1 }, updated_at: updatedAt },
      b: { data: { foo: 2 }, updated_at: earlierUpdatedAt },
    };
    mockResults([{ data, isLoading: false, isError: false }]);

    const { result } = renderHook(() => useConfigs(['a', 'b']));

    expect(queriesPassed()).toEqual([
      expect.objectContaining({
        endpoint: '/configs',
        method: 'GET',
        parameters: [['ids', 'a,b']],
        queryKey: ['/configs', ['a', 'b']],
        enabled: true,
      }),
    ]);
    expect(result.current).toEqual({ data, isLoading: false, isError: false });
  });

  it('passes polling as refetchInterval when provided', () => {
    mockResults([{ data: {}, isLoading: false, isError: false }]);

    renderHook(() => useConfigs(['a'], 5000));

    expect(queriesPassed()[0]).toEqual(expect.objectContaining({ refetchInterval: 5000 }));
  });

  it('disables refetchInterval when polling is not provided', () => {
    mockResults([{ data: {}, isLoading: false, isError: false }]);

    renderHook(() => useConfigs(['a']));

    expect(queriesPassed()[0]).toEqual(expect.objectContaining({ refetchInterval: false }));
  });

  it('runs no query and returns empty, settled data when ids is empty', () => {
    mockResults([]);

    const { result } = renderHook(() => useConfigs([]));

    expect(queriesPassed()).toEqual([]);
    expect(result.current).toEqual({ data: {}, isLoading: false, isError: false });
  });

  it('splits ids into batches of 100, the backend maxItems, and merges every batch', () => {
    const allIds = ids(250);
    const chunks = [allIds.slice(0, 100), allIds.slice(100, 200), allIds.slice(200)];
    mockResults(chunks.map(chunk => ({ data: configsFor(chunk), isLoading: false, isError: false })));

    const { result } = renderHook(() => useConfigs(allIds));

    expect(queriesPassed()).toEqual(
      chunks.map(chunk =>
        expect.objectContaining({ parameters: [['ids', chunk.join(',')]], queryKey: ['/configs', chunk], enabled: true }),
      ),
    );
    expect(Object.keys(result.current.data).sort()).toEqual([...allIds].sort());
  });

  it.each([
    [100, [100]],
    [101, [100, 1]],
  ])('sends %i ids as batches of %p', (count, batchSizes) => {
    mockResults(batchSizes.map(() => ({ data: {}, isLoading: false, isError: false })));

    renderHook(() => useConfigs(ids(count)));

    expect(queriesPassed().map(({ queryKey }: { queryKey: [string, string[]] }) => queryKey[1].length)).toEqual(batchSizes);
  });

  it('reports isError when one batch fails and still returns the other batches', () => {
    const allIds = ids(150);
    mockResults([
      { data: configsFor(allIds.slice(0, 100)), isLoading: false, isError: false },
      { data: undefined, isLoading: false, isError: true },
    ]);

    const { result } = renderHook(() => useConfigs(allIds));

    expect(result.current.isError).toBe(true);
    expect(Object.keys(result.current.data)).toHaveLength(100);
  });

  it('reports isLoading until every batch has resolved', () => {
    const allIds = ids(150);
    mockResults([
      { data: configsFor(allIds.slice(0, 100)), isLoading: false, isError: false },
      { data: undefined, isLoading: true, isError: false },
    ]);

    const { result } = renderHook(() => useConfigs(allIds));

    expect(result.current.isLoading).toBe(true);
  });
});
