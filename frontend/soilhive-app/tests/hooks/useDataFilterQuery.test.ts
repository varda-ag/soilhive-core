import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useDebounce } from 'hooks/useDebounce';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import type { DataFilter } from 'types/backend';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useDebounce', () => ({
  useDebounce: jest.fn((value: unknown, delay: number) => ({ value, isPending: false })),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;
const useDebounceMock = useDebounce as jest.MockedFunction<typeof useDebounce>;

const MOCK_GEOMETRY = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

const MOCK_FILTERS: DataFilter = {
  geometries: [MOCK_GEOMETRY],
  parameters: { min_depth: 0, max_depth: 50 },
};

const MOCK_STORED_FILTER = {
  id: 'stored-filter-id',
  filter: MOCK_FILTERS,
};

describe('useDataFilterQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDebounceMock.mockImplementation((value: unknown) => ({ value, isPending: false }));
  });

  it('returns loading state when request is in progress', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);

    const { result } = renderHook(() => useDataFilterQuery(MOCK_FILTERS));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.filterId).toBeUndefined();
    expect(result.current.selectedFilters).toBeUndefined();
  });

  it('returns filterId and selectedFilters when loaded', () => {
    useApiQueryMock.mockReturnValue({ data: MOCK_STORED_FILTER, isLoading: false } as any);

    const { result } = renderHook(() => useDataFilterQuery(MOCK_FILTERS));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.filterId).toBe('stored-filter-id');
    expect(result.current.selectedFilters).toEqual(MOCK_STORED_FILTER);
  });

  it('calls the correct endpoint with POST method and debounced filters as body', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useDataFilterQuery(MOCK_FILTERS));

    expect(useApiQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/data-filters',
        method: 'POST',
        body: MOCK_FILTERS,
        queryKey: ['data-filter', MOCK_FILTERS],
      }),
    );
  });

  it('is enabled when geometries are provided and enabled is true', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useDataFilterQuery(MOCK_FILTERS, true));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('is disabled when geometries array is empty', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    const filtersWithoutGeometries: DataFilter = { geometries: [], parameters: {} };

    renderHook(() => useDataFilterQuery(filtersWithoutGeometries, true));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('is disabled when enabled param is false', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useDataFilterQuery(MOCK_FILTERS, false));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('passes filters and enabled through useDebounce with 300ms delay', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    renderHook(() => useDataFilterQuery(MOCK_FILTERS));

    expect(useDebounceMock).toHaveBeenCalledWith({ filters: MOCK_FILTERS, enabled: true }, 300);
  });
});
