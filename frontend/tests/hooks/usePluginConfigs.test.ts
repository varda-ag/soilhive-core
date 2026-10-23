import { renderHook } from '@testing-library/react';
import useConfigs from 'hooks/useConfigs';
import usePluginConfigs from 'hooks/usePluginConfigs';

jest.mock('hooks/useConfigs', () => jest.fn());

const useConfigsMock = useConfigs as jest.Mock;
const updatedAt = '2026-10-23T07:59:52.473Z';
const earlierUpdatedAt = '2026-10-22T10:00:00.000Z';

describe('usePluginConfigs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('namespaces ids with the pluginId and strips the prefix back off the returned entries', () => {
    useConfigsMock.mockReturnValue({
      data: {
        'plugin:myPlugin:a': { config: { foo: 1 }, updatedAt },
        'plugin:myPlugin:b': { config: { foo: 2 }, updatedAt: earlierUpdatedAt },
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(useConfigs).toHaveBeenCalledWith(['plugin:myPlugin:a', 'plugin:myPlugin:b'], undefined);
    expect(result.current.data).toEqual({
      a: { config: { foo: 1 }, updatedAt },
      b: { config: { foo: 2 }, updatedAt: earlierUpdatedAt },
    });
  });

  it('keeps every entry when useConfigs returns the same data again, e.g. an unchanged poll', () => {
    const data = { 'plugin:myPlugin:a': { config: { foo: 1 }, updatedAt } };
    useConfigsMock.mockReturnValue({ data, isLoading: false, isError: false });

    const { result, rerender } = renderHook(() => usePluginConfigs('myPlugin', ['a']));
    const first = result.current.data.a;
    rerender();

    expect(result.current.data.a).toBe(first);
  });

  it('forwards polling to useConfigs', () => {
    useConfigsMock.mockReturnValue({ data: {}, isLoading: false, isError: false });

    renderHook(() => usePluginConfigs('myPlugin', ['a'], 5000));

    expect(useConfigs).toHaveBeenCalledWith(['plugin:myPlugin:a'], 5000);
  });

  it('omits ids missing from the response and passes isLoading/isError through unchanged', () => {
    useConfigsMock.mockReturnValue({
      data: { 'plugin:myPlugin:a': { config: { foo: 1 }, updatedAt } },
      isLoading: true,
      isError: true,
    });

    const { result } = renderHook(() => usePluginConfigs('myPlugin', ['a', 'b']));

    expect(result.current.data).toEqual({ a: { config: { foo: 1 }, updatedAt } });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});
