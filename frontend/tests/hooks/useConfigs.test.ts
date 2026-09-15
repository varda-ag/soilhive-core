import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import useConfigs from 'hooks/useConfigs';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));

const useApiQueryMock = useApiQuery as jest.Mock;

describe('useConfigs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches /config with comma-separated ids and returns the resolved data', () => {
    const data = { a: { foo: 1 }, b: { foo: 2 } };
    useApiQueryMock.mockReturnValue({ data, isLoading: false, isError: false });

    const { result } = renderHook(() => useConfigs(['a', 'b']));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/config',
        method: 'GET',
        parameters: [['ids', 'a,b']],
        queryKey: ['/config', ['a', 'b']],
        enabled: true,
        authenticate: false,
      }),
    );
    expect(result.current.data).toBe(data);
  });

  it('disables the query and defaults data to {} when ids is empty', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    const { result } = renderHook(() => useConfigs([]));

    expect(useApiQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(result.current.data).toEqual({});
  });
});
