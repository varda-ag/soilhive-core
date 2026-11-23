import { renderHook } from '@testing-library/react';
import { useInviteRedeem } from 'hooks/useInviteRedeem';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({ BACKEND_BASE_URL: 'https://api.example.com' }));

const invalidateQueries = jest.fn();
// Runs mutationFn directly, so the test reads the request it makes and what it rejects with.
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
  useMutation: jest.fn(({ mutationFn }: { mutationFn: unknown }) => ({ mutateAsync: mutationFn, isPending: false, isError: false })),
}));

const request = jest.fn();
(useRequest as jest.Mock).mockReturnValue({ request });

const httpError = (status: number, raw?: unknown) => Object.assign(new Error(`HTTP ${status}`), { status, raw });

// The predicate the hook passed to pick the config reads to refetch.
const configPredicate = () =>
  invalidateQueries.mock.calls.map(([filters]) => filters.predicate).find(Boolean) as (query: { queryKey: unknown[] }) => boolean;

describe('useInviteRedeem', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redeems the token without the global error toast', async () => {
    request.mockResolvedValue({ grants: {} });
    const { result } = renderHook(() => useInviteRedeem());

    await result.current.mutateAsync({ token: 'secret' });

    expect(request).toHaveBeenCalledWith({
      url: 'https://api.example.com/invites/redeem',
      method: 'POST',
      body: { token: 'secret' },
      showErrorNotification: false,
    });
  });

  it("resolves with nothing: the grants may name other plugins' items", async () => {
    request.mockResolvedValue({ grants: { configs: { 'plugin:other:x': ['read'] } } });
    const { result } = renderHook(() => useInviteRedeem());

    await expect(result.current.mutateAsync({ token: 'secret' })).resolves.toBeUndefined();
  });

  it('refetches the grants and every config read once redeemed', async () => {
    request.mockResolvedValue({ grants: {} });
    const { result } = renderHook(() => useInviteRedeem());

    await result.current.mutateAsync({ token: 'secret' });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entitlements'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['config-entitlements'] });
    expect(configPredicate()({ queryKey: ['/configs/plugin:acme:dashboards:abc'] })).toBe(true);
    expect(configPredicate()({ queryKey: ['/configs'] })).toBe(true);
    expect(configPredicate()({ queryKey: ['/datasets'] })).toBe(false);
    expect(configPredicate()({ queryKey: [{ endpoint: '/configs' }] })).toBe(false);
  });

  it('rejects with the status and the problem body, and refetches nothing', async () => {
    const body = { title: 'Forbidden', recipient_hint: 'j•••@example.com' };
    request.mockRejectedValue(httpError(403, body));
    const { result } = renderHook(() => useInviteRedeem());

    await expect(result.current.mutateAsync({ token: 'secret' })).rejects.toEqual({ status: 403, body });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects with status 0 when no response came', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useInviteRedeem());

    await expect(result.current.mutateAsync({ token: 'secret' })).rejects.toEqual({ status: 0, body: undefined });
  });
});
