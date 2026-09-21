import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { useUserEntitlements } from 'hooks/useUserEntitlements';
import { EntitlementScope } from 'types/backend';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('../../src/auth/AuthContextProvider', () => ({ useAuthContext: jest.fn() }));

const useApiQueryMock = useApiQuery as jest.Mock;
const useAuthContextMock = useAuthContext as jest.Mock;

describe('useUserEntitlements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches /entitlements with the requested scope when authenticated', () => {
    useAuthContextMock.mockReturnValue({ isAuthenticated: true });
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderHook(() => useUserEntitlements(EntitlementScope.CONFIGS));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/entitlements',
        method: 'GET',
        parameters: [['scope', EntitlementScope.CONFIGS]],
        queryKey: ['entitlements', EntitlementScope.CONFIGS],
        enabled: true,
      }),
    );
  });

  it('disables the query when the caller is not authenticated', () => {
    useAuthContextMock.mockReturnValue({ isAuthenticated: false });
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderHook(() => useUserEntitlements(EntitlementScope.DATASETS));

    expect(useApiQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('returns whatever useApiQuery returns, unchanged', () => {
    const result = { data: { 'my-config': ['write'] }, isLoading: false, isError: false };
    useAuthContextMock.mockReturnValue({ isAuthenticated: true });
    useApiQueryMock.mockReturnValue(result);

    const { result: hookResult } = renderHook(() => useUserEntitlements(EntitlementScope.CONFIGS));

    expect(hookResult.current).toBe(result);
  });
});
