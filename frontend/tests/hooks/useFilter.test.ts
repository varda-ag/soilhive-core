import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useFilter } from 'hooks/useFilter';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;

const MOCK_STORED_FILTER = {
  id: 'test-filter-id',
  filter: {
    geometries: [],
    parameters: { data_types: ['point'] },
  },
};

describe('useFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading state when request is in progress', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);

    const { result } = renderHook(() => useFilter('test-filter-id'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.filter).toBeUndefined();
  });

  it('returns the stored filter when loaded', () => {
    useApiQueryMock.mockReturnValue({ data: MOCK_STORED_FILTER, isLoading: false, isError: false } as any);

    const { result } = renderHook(() => useFilter('test-filter-id'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.filter).toEqual(MOCK_STORED_FILTER);
  });

  it('returns error state when request fails', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true } as any);

    const { result } = renderHook(() => useFilter('test-filter-id'));

    expect(result.current.isError).toBe(true);
  });

  it('calls the correct endpoint with the given filterId', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);

    renderHook(() => useFilter('test-filter-id'));

    expect(useApiQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/data-filters/test-filter-id',
        method: 'GET',
        queryKey: ['data-filter', 'test-filter-id'],
        enabled: true,
        retry: false,
      }),
    );
  });

  it('is disabled when filterId is undefined', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);

    renderHook(() => useFilter(undefined));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
