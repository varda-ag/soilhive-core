import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { Capability, EntitlementScope } from 'types/backend';
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

describe('useConfig', () => {
  const configId = 'plugin:acme:widget';
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

  it('saveConfig calls the mutation and invalidates the query when the caller holds WRITE on the id', async () => {
    const can = jest.fn().mockReturnValue(true);
    useEntitlementsMock.mockReturnValue({ can });

    const { result } = renderHook(() => useConfig(configId));
    await result.current.saveConfig({ updated: true });

    expect(can).toHaveBeenCalledWith(Capability.WRITE, configId);
    expect(mutateAsync).toHaveBeenCalledWith({ updated: true });
  });

  it('saveConfig is a no-op when the caller lacks WRITE on the id', async () => {
    const can = jest.fn().mockReturnValue(false);
    useEntitlementsMock.mockReturnValue({ can });

    const { result } = renderHook(() => useConfig(configId));
    await result.current.saveConfig({ updated: true });

    expect(can).toHaveBeenCalledWith(Capability.WRITE, configId);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('fetches GET /config/{id} anonymously', () => {
    useEntitlementsMock.mockReturnValue({ can: jest.fn().mockReturnValue(false) });

    renderHook(() => useConfig(configId));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: `/config/${configId}`,
        method: 'GET',
        authenticate: false,
        notFoundAsNull: true,
      }),
    );
  });
});
