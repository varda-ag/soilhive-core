import { renderHook } from '@testing-library/react';
import { useConfigEntitlements, useConfigEntitlementsMutation } from 'hooks/useConfigEntitlements';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from 'hooks/usePluginConfigEntitlements';

jest.mock('hooks/useConfigEntitlements', () => ({
  useConfigEntitlements: jest.fn(),
  useConfigEntitlementsMutation: jest.fn(),
}));

const useConfigEntitlementsMock = useConfigEntitlements as jest.Mock;
const useConfigEntitlementsMutationMock = useConfigEntitlementsMutation as jest.Mock;

describe('usePluginConfigEntitlements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('namespaces configId with the pluginId', () => {
    renderHook(() => usePluginConfigEntitlements('myPlugin', 'settings'));

    expect(useConfigEntitlements).toHaveBeenCalledWith('plugin:myPlugin:settings');
  });

  it('namespaces different plugins separately so configIds cannot collide', () => {
    renderHook(() => usePluginConfigEntitlements('pluginA', 'settings'));
    renderHook(() => usePluginConfigEntitlements('pluginB', 'settings'));

    expect(useConfigEntitlements).toHaveBeenNthCalledWith(1, 'plugin:pluginA:settings');
    expect(useConfigEntitlements).toHaveBeenNthCalledWith(2, 'plugin:pluginB:settings');
  });

  it('returns whatever useConfigEntitlements returns, unchanged', () => {
    const result = { data: { subject: ['read'] }, isLoading: false, isError: false };
    useConfigEntitlementsMock.mockReturnValue(result);

    const { result: hookResult } = renderHook(() => usePluginConfigEntitlements('myPlugin', 'settings'));

    expect(hookResult.current).toBe(result);
  });
});

describe('usePluginConfigEntitlementsMutation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('namespaces configId with the pluginId', () => {
    renderHook(() => usePluginConfigEntitlementsMutation('myPlugin', 'settings'));

    expect(useConfigEntitlementsMutation).toHaveBeenCalledWith('plugin:myPlugin:settings');
  });

  it('namespaces different plugins separately so configIds cannot collide', () => {
    renderHook(() => usePluginConfigEntitlementsMutation('pluginA', 'settings'));
    renderHook(() => usePluginConfigEntitlementsMutation('pluginB', 'settings'));

    expect(useConfigEntitlementsMutation).toHaveBeenNthCalledWith(1, 'plugin:pluginA:settings');
    expect(useConfigEntitlementsMutation).toHaveBeenNthCalledWith(2, 'plugin:pluginB:settings');
  });

  it('returns whatever useConfigEntitlementsMutation returns, unchanged', () => {
    const result = { mutateAsync: jest.fn(), isPending: false, isError: false };
    useConfigEntitlementsMutationMock.mockReturnValue(result);

    const { result: hookResult } = renderHook(() => usePluginConfigEntitlementsMutation('myPlugin', 'settings'));

    expect(hookResult.current).toBe(result);
  });
});
