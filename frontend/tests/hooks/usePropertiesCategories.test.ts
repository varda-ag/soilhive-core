import { renderHook } from '@testing-library/react';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';
import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;

describe('usePropertiesCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls useApiQuery with the correct config', () => {
    useApiQueryMock.mockReturnValue({} as any);

    renderHook(() => usePropertiesCategories());

    expect(useApiQueryMock).toHaveBeenCalledTimes(1);
    expect(useApiQueryMock).toHaveBeenCalledWith({
      endpoint: '/soil-property-categories',
      method: 'GET',
      queryKey: ['soil-property-categories'],
      enabled: true,
    });
  });

  it('returns whatever useApiQuery returns', () => {
    const fakeReturn = {
      data: [{ id: '1', category_name: 'Biological' }],
      isLoading: false,
      error: null,
    };

    useApiQueryMock.mockReturnValue(fakeReturn as any);

    const { result } = renderHook(() => usePropertiesCategories());

    expect(result.current).toBe(fakeReturn);
  });
});
