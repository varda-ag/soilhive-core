import { act, renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilIndexScore, useSoilIndexTileSource } from 'hooks/useSoilIndexTiles';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('configuration/api', () => ({
  ...jest.requireActual('configuration/api'),
  BACKEND_BASE_URL: 'https://api.example/api/v1',
}));

const useApiQueryMock = useApiQuery as jest.Mock;

// The options the hook passed to useApiQuery on its last render.
const queryOptions = () => useApiQueryMock.mock.calls[useApiQueryMock.mock.calls.length - 1][0];

const RUN = '0b7c5e2a-2d55-4d0e-9a51-6a3f8f5f2c11';

describe('useSoilIndexTileSource', () => {
  beforeEach(() => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads the Run TileJSON without a token or the global error toast', () => {
    renderHook(() => useSoilIndexTileSource(RUN));

    expect(queryOptions()).toMatchObject({
      endpoint: `/soil-indexes/${RUN}/tiles`,
      method: 'GET',
      enabled: true,
      authenticate: false,
      showErrorNotification: false,
    });
  });

  it('does not fetch without a run id', () => {
    renderHook(() => useSoilIndexTileSource(undefined));

    expect(queryOptions().enabled).toBe(false);
  });

  it('turns the relative tile paths into a MapLibre vector source on the API base', () => {
    useApiQueryMock.mockReturnValue({
      data: {
        tilejson: '3.0.0',
        tiles: [`/soil-indexes/${RUN}/tiles/1/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 16,
        bounds: [1, 2, 3, 4],
        vector_layers: [],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useSoilIndexTileSource(RUN));

    expect(result.current.data).toEqual({
      type: 'vector',
      tiles: [`https://api.example/api/v1/soil-indexes/${RUN}/tiles/1/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: 16,
      bounds: [1, 2, 3, 4],
    });
  });

  it('leaves bounds out for a Run that scored nothing', () => {
    useApiQueryMock.mockReturnValue({
      data: { tiles: ['/t/{z}/{x}/{y}'], minzoom: 0, maxzoom: 16, vector_layers: [] },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useSoilIndexTileSource(RUN));

    expect(result.current.data).not.toHaveProperty('bounds');
  });
});

describe('useSoilIndexScore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('fetches a hovered score once the pointer settles on it, cached forever', () => {
    const { rerender } = renderHook(({ scoreId }) => useSoilIndexScore(RUN, scoreId), {
      initialProps: { scoreId: undefined as number | undefined },
    });
    rerender({ scoreId: 7 });

    // Still settling: the pointer may only be crossing this score.
    expect(queryOptions().enabled).toBe(false);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(queryOptions()).toMatchObject({
      endpoint: `/soil-indexes/${RUN}/scores/7`,
      enabled: true,
      staleTime: Infinity,
      authenticate: false,
      showErrorNotification: false,
    });
  });

  it('shows nothing for a score the pointer has left', () => {
    useApiQueryMock.mockReturnValue({ data: { id: 7, value: 0.4, metadata: {} }, isLoading: false, isError: false });

    const { result, rerender } = renderHook(({ scoreId }) => useSoilIndexScore(RUN, scoreId), {
      initialProps: { scoreId: 7 as number | undefined },
    });
    expect(result.current.data).toEqual({ id: 7, value: 0.4, metadata: {} });

    rerender({ scoreId: undefined });

    expect(result.current.data).toBeUndefined();
  });
});
