import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;

const MOCK_DATASETS = [
  { id: 'dataset-1', name: 'Dataset 1', data_type: 'vector' },
  { id: 'dataset-2', name: 'Dataset 2', data_type: 'raster' },
];

describe('useFilteredDatasetsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading state when request is in progress', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);

    const { result } = renderHook(() => useFilteredDatasetsQuery('test-filter-id'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns data when loaded', () => {
    useApiQueryMock.mockReturnValue({ data: MOCK_DATASETS, isLoading: false } as any);

    const { result } = renderHook(() => useFilteredDatasetsQuery('test-filter-id'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual(MOCK_DATASETS);
  });

  it('calls the correct endpoint with the given filterDataId', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredDatasetsQuery('test-filter-id'));

    expect(useApiQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/data-filters/test-filter-id/datasets',
        method: 'GET',
        queryKey: ['coverage-datasets', 'test-filter-id'],
        retry: false,
      }),
    );
  });

  it('is enabled when filterDataId is provided', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredDatasetsQuery('test-filter-id'));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('is disabled when filterDataId is undefined', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useFilteredDatasetsQuery(undefined));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
