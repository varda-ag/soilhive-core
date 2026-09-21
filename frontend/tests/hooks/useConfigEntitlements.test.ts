import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useConfigEntitlements, useConfigEntitlementsMutation } from 'hooks/useConfigEntitlements';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));

const useApiQueryMock = useApiQuery as jest.Mock;
const useApiMutationMock = useApiMutation as jest.Mock;

describe('useConfigEntitlements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches /config/{configId}/entitlements with the expected options', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderHook(() => useConfigEntitlements('abc'));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/config/abc/entitlements',
        method: 'GET',
        queryKey: ['config-entitlements', 'abc'],
        enabled: true,
        showErrorNotification: false,
      }),
    );
  });

  it('disables the query when configId is undefined', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderHook(() => useConfigEntitlements(undefined));

    expect(useApiQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe('useConfigEntitlementsMutation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('PUTs to /config/{configId}/entitlements', () => {
    useApiMutationMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false, isError: false });

    renderHook(() => useConfigEntitlementsMutation('abc'));

    expect(useApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/config/abc/entitlements',
        method: 'PUT',
      }),
    );
  });
});
