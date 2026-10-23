import { renderHook } from '@testing-library/react';
import useConfigs from 'hooks/useConfigs';
import usePluginConfigs from 'hooks/usePluginConfigs';

jest.mock('hooks/useConfigs', () => jest.fn());

const useConfigsMock = useConfigs as jest.Mock;

describe('usePluginConfigs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('namespaces ids with the pluginId and strips the prefix back off the returned map', () => {
    useConfigsMock.mockReturnValue({
      data: {
        'plugin:myPlugin:a': { data: { foo: 1 }, updated_at: '2026-10-23T07:59:52.473Z' },
        'plugin:myPlugin:b': { data: { foo: 2 }, updated_at: '2026-10-22T10:00:00.000Z' },
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(useConfigs).toHaveBeenCalledWith(['plugin:myPlugin:a', 'plugin:myPlugin:b'], undefined);
    expect(result.current.data).toEqual({
      a: { config: { foo: 1 }, updatedAt: '2026-10-23T07:59:52.473Z' },
      b: { config: { foo: 2 }, updatedAt: '2026-10-22T10:00:00.000Z' },
    });
  });

  it('forwards polling to useConfigs', () => {
    useConfigsMock.mockReturnValue({ data: {}, isLoading: false, isError: false });

    renderHook(() => usePluginConfigs('myPlugin', ['a'], 5000));

    expect(useConfigs).toHaveBeenCalledWith(['plugin:myPlugin:a'], 5000);
  });

  it('omits ids missing from the response and passes isLoading/isError through unchanged', () => {
    useConfigsMock.mockReturnValue({
      data: { 'plugin:myPlugin:a': { data: { foo: 1 }, updated_at: '2026-10-23T07:59:52.473Z' } },
      isLoading: true,
      isError: true,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(result.current.data).toEqual({ a: { config: { foo: 1 }, updatedAt: '2026-10-23T07:59:52.473Z' } });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});
