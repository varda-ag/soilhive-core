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
      data: { 'plugin:myPlugin:a': { foo: 1 }, 'plugin:myPlugin:b': { foo: 2 } },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(useConfigs).toHaveBeenCalledWith(['plugin:myPlugin:a', 'plugin:myPlugin:b']);
    expect(result.current.data).toEqual({ a: { foo: 1 }, b: { foo: 2 } });
  });

  it('omits ids missing from the response and passes isLoading/isError through unchanged', () => {
    useConfigsMock.mockReturnValue({
      data: { 'plugin:myPlugin:a': { foo: 1 } },
      isLoading: true,
      isError: true,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(result.current.data).toEqual({ a: { foo: 1 } });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});
