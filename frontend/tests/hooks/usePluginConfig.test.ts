import { renderHook } from '@testing-library/react';
import useConfig from 'hooks/useConfig';
import usePluginConfig from 'hooks/usePluginConfig';

jest.mock('hooks/useConfig', () => jest.fn());

describe('usePluginConfig', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('namespaces the id with the pluginId and forwards the default config', () => {
    const defaultConfig = { foo: 'bar' };
    renderHook(() => usePluginConfig('myPlugin', 'settings', defaultConfig));

    expect(useConfig).toHaveBeenCalledWith('plugin:myPlugin:settings', defaultConfig);
  });

  it('forwards undefined when no default config is given', () => {
    renderHook(() => usePluginConfig('myPlugin', 'settings'));

    expect(useConfig).toHaveBeenCalledWith('plugin:myPlugin:settings', undefined);
  });

  it('namespaces different plugins separately so ids cannot collide', () => {
    renderHook(() => usePluginConfig('pluginA', 'settings'));
    renderHook(() => usePluginConfig('pluginB', 'settings'));

    expect(useConfig).toHaveBeenNthCalledWith(1, 'plugin:pluginA:settings', undefined);
    expect(useConfig).toHaveBeenNthCalledWith(2, 'plugin:pluginB:settings', undefined);
  });

  it('returns whatever useConfig returns, unchanged', () => {
    const result = { config: { foo: 'bar' }, isLoading: false, isError: false, saveConfig: jest.fn() };
    (useConfig as jest.Mock).mockReturnValue(result);

    const { result: hookResult } = renderHook(() => usePluginConfig('myPlugin', 'settings'));

    expect(hookResult.current).toBe(result);
  });
});
