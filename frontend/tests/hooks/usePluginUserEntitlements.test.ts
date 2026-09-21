import { renderHook } from '@testing-library/react';
import { useUserEntitlements } from 'hooks/useUserEntitlements';
import { usePluginUserEntitlements } from 'hooks/usePluginUserEntitlements';
import { EntitlementScope } from 'types/backend';

jest.mock('hooks/useUserEntitlements', () => ({ useUserEntitlements: jest.fn() }));

const useUserEntitlementsMock = useUserEntitlements as jest.Mock;

describe('usePluginUserEntitlements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the requested scope and filters+unprefixes entries to the calling plugin', () => {
    useUserEntitlementsMock.mockReturnValue({
      data: {
        'plugin:myPlugin:a': ['read'],
        'plugin:otherPlugin:b': ['write'],
        'frontend-logo': ['read'],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => usePluginUserEntitlements('myPlugin', 'configs'));

    expect(useUserEntitlements).toHaveBeenCalledWith(EntitlementScope.CONFIGS);
    expect(result.current.data).toEqual({ a: ['read'] });
  });

  it('forwards the dashboards scope', () => {
    useUserEntitlementsMock.mockReturnValue({ data: {}, isLoading: false, isError: false });

    renderHook(() => usePluginUserEntitlements('myPlugin', 'dashboards'));

    expect(useUserEntitlements).toHaveBeenCalledWith(EntitlementScope.DASHBOARDS);
  });

  it('namespaces different plugins separately so entries cannot collide', () => {
    useUserEntitlementsMock.mockReturnValue({
      data: { 'plugin:pluginA:x': ['read'], 'plugin:pluginB:x': ['write'] },
      isLoading: false,
      isError: false,
    });

    const { result: resultA } = renderHook(() => usePluginUserEntitlements('pluginA', 'configs'));
    const { result: resultB } = renderHook(() => usePluginUserEntitlements('pluginB', 'configs'));

    expect(resultA.current.data).toEqual({ x: ['read'] });
    expect(resultB.current.data).toEqual({ x: ['write'] });
  });

  it('passes isLoading/isError through unchanged and defaults data to {} while loading', () => {
    useUserEntitlementsMock.mockReturnValue({ data: undefined, isLoading: true, isError: true });

    const { result } = renderHook(() => usePluginUserEntitlements('myPlugin', 'configs'));

    expect(result.current.data).toEqual({});
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
  });
});
