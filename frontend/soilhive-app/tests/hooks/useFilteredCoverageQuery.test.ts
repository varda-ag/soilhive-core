import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;

const MOCK_FILTERED_DATA = {
  datasets: [
    { id: 'dataset-1', name: 'Dataset 1', dataset_layer_count: 5 },
    { id: 'dataset-2', name: 'Dataset 2', dataset_layer_count: 3 },
  ],
  raster_filters: { soil_groups: [1, 2, 3] },
};

describe('useFilteredCoverageQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading state when request is in progress', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);

    const { result } = renderHook(() => useFilteredCoverageQuery('test-filter-id'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns data when loaded', () => {
    useApiQueryMock.mockReturnValue({ data: MOCK_FILTERED_DATA, isLoading: false } as any);

    const { result } = renderHook(() => useFilteredCoverageQuery('test-filter-id'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual(MOCK_FILTERED_DATA);
  });

  it('calls the correct endpoint with the given filterDataId', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredCoverageQuery('test-filter-id'));

    expect(useApiQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/data-filters/test-filter-id/coverage',
        method: 'GET',
        queryKey: ['data-filter-coverage', 'test-filter-id'],
        retry: false,
      }),
    );
  });

  it('is enabled when filterDataId is provided', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredCoverageQuery('test-filter-id'));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('is disabled when filterDataId is undefined', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredCoverageQuery(undefined));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
