import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { retryConfigEntitlements, useConfigEntitlements, useConfigEntitlementsMutation } from 'hooks/useConfigEntitlements';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));

const useApiQueryMock = useApiQuery as jest.Mock;
const useApiMutationMock = useApiMutation as jest.Mock;

describe('useConfigEntitlements', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches /configs/{configId}/entitlements with the expected options', () => {
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    renderHook(() => useConfigEntitlements('abc'));

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/configs/abc/entitlements',
        method: 'GET',
        queryKey: ['config-entitlements', 'abc'],
        enabled: true,
        retry: retryConfigEntitlements,
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

describe('retryConfigEntitlements', () => {
  const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  it.each([403, 404])('does not retry a %i: the item is unreadable or gone, e.g. just deleted', status => {
    expect(retryConfigEntitlements(0, httpError(status))).toBe(false);
  });

  it('retries a server or network error up to three times', () => {
    expect(retryConfigEntitlements(0, httpError(500))).toBe(true);
    expect(retryConfigEntitlements(2, new TypeError('Failed to fetch'))).toBe(true);
    expect(retryConfigEntitlements(3, httpError(500))).toBe(false);
  });
});

describe('useConfigEntitlementsMutation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('PUTs to /configs/{configId}/entitlements', () => {
    useApiMutationMock.mockReturnValue({ mutateAsync: jest.fn(), isPending: false, isError: false });

    renderHook(() => useConfigEntitlementsMutation('abc'));

    expect(useApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/configs/abc/entitlements',
        method: 'PUT',
      }),
    );
  });
});
