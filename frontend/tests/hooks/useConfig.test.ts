import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';
import { queryClient } from '../../src/App';
import useConfig from 'hooks/useConfig';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));
jest.mock('hooks/useEntitlementsHook', () => ({ useEntitlements: jest.fn() }));
jest.mock('../../src/App', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

const useApiQueryMock = useApiQuery as jest.Mock;
const useApiMutationMock = useApiMutation as jest.Mock;
const useEntitlementsMock = useEntitlements as jest.Mock;
const invalidateQueries = queryClient.invalidateQueries as jest.Mock;

describe('useConfig', () => {
  const configId = 'plugin:acme:widget';
  const systemConfigId = 'theme';
  const mutateAsync = jest.fn();

  beforeEach(() => {
    useApiQueryMock.mockReturnValue({ data: { some: 'value' }, isLoading: false, isError: false });
    useApiMutationMock.mockReturnValue({ mutateAsync });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('checks entitlements scoped to CONFIGS', () => {
    useEntitlementsMock.mockReturnValue({ can: jest.fn().mockReturnValue(false) });

    renderHook(() => useConfig(configId));

    expect(useEntitlements).toHaveBeenCalledWith(EntitlementScope.CONFIGS);
  });

  it('saveConfig calls the mutation and invalidates only the config query when the caller already holds WRITE', async () => {
    const can = jest.fn().mockReturnValue(true);
    useEntitlementsMock.mockReturnValue({ can });

    const { result } = renderHook(() => useConfig(configId));
    await result.current.saveConfig({ updated: true });

    expect(can).toHaveBeenCalledWith(Capability.WRITE, configId);
    expect(mutateAsync).toHaveBeenCalledWith({ updated: true });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [`/config/${configId}`] });
    // Already had the grant, nothing changed on the entitlements side — no need to refetch it.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['entitlements', EntitlementScope.CONFIGS] });
  });

  // ADR 0037: a plugin's first PUT is how it claims WRITE on a fresh plugin: id (the backend's
  // atomic first-access bootstrap in ConfigService.putConfig). Gating on can() here — a pure
  // client-side read of grants that, by definition, can't exist yet for an unclaimed id — would
  // make that bootstrap unreachable from the UI: exactly the outcome the ADR rejects.
  it('saveConfig attempts the PUT for a plugin: id even without an existing WRITE grant, then refreshes the CONFIGS entitlements cache', async () => {
    const can = jest.fn().mockReturnValue(false);
    useEntitlementsMock.mockReturnValue({ can });

    const { result } = renderHook(() => useConfig(configId));
    await result.current.saveConfig({ updated: true });

    expect(can).toHaveBeenCalledWith(Capability.WRITE, configId);
    expect(mutateAsync).toHaveBeenCalledWith({ updated: true });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [`/config/${configId}`] });
    // The caller just self-granted WRITE on the backend — the cached CONFIGS entitlements
    // (fetched once and reused by can()) don't know about it yet without a refetch.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entitlements', EntitlementScope.CONFIGS] });
  });

  it('saveConfig is a no-op for a non-plugin (system) id when the caller lacks WRITE — the backend has no bootstrap for it', async () => {
    const can = jest.fn().mockReturnValue(false);
    useEntitlementsMock.mockReturnValue({ can });

    const { result } = renderHook(() => useConfig(systemConfigId));
    await result.current.saveConfig({ updated: true });

    expect(can).toHaveBeenCalledWith(Capability.WRITE, systemConfigId);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('fetches GET /config/{id} with the token when one exists, so an anonymous visit stays anonymous but a caller does not lose access to their own entitled configs', () => {
    useEntitlementsMock.mockReturnValue({ can: jest.fn().mockReturnValue(false) });

    renderHook(() => useConfig(configId));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: `/config/${configId}`,
        method: 'GET',
        notFoundAsNull: true,
      }),
    );
    // authenticate must not be forced false — GET is entitlements-gated, so a logged-in caller
    // (WRITE holder, or an admin) needs their token sent, not just EVERYONE's grants.
    expect(useApiQuery).not.toHaveBeenCalledWith(expect.objectContaining({ authenticate: false }));
  });
});
