import { renderHook } from '@testing-library/react';
import usePluginConfigDelete from 'hooks/usePluginConfigDelete';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({ BACKEND_BASE_URL: 'https://api.example.com' }));

const invalidateQueries = jest.fn();
// Runs mutationFn directly, so a rejection it swallows never reaches isError.
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
  useMutation: jest.fn(({ mutationFn }: { mutationFn: unknown }) => ({ mutateAsync: mutationFn, isPending: false, isError: false })),
}));

const request = jest.fn();
(useRequest as jest.Mock).mockReturnValue({ request });

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('usePluginConfigDelete', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the namespaced item without the global error toast, then refetches every listing', async () => {
    request.mockResolvedValue(null);
    const { result } = renderHook(() => usePluginConfigDelete('acme'));

    await result.current.mutateAsync({ id: 'dashboards:abc' });

    expect(request).toHaveBeenCalledWith({
      url: 'https://api.example.com/configs/plugin:acme:dashboards:abc',
      method: 'DELETE',
      showErrorNotification: false,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entitlements'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/configs'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/configs/plugin:acme:dashboards:abc'] });
  });

  it.each([403, 404])('resolves and still refetches on %i: nothing is left the caller can delete', async status => {
    request.mockRejectedValue(httpError(status));
    const { result } = renderHook(() => usePluginConfigDelete('acme'));

    await expect(result.current.mutateAsync({ id: 'dashboards:abc' })).resolves.toBeUndefined();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entitlements'] });
  });

  it('rejects on a server error, without refetching', async () => {
    request.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => usePluginConfigDelete('acme'));

    await expect(result.current.mutateAsync({ id: 'dashboards:abc' })).rejects.toThrow('HTTP 500');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects on a network error', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => usePluginConfigDelete('acme'));

    await expect(result.current.mutateAsync({ id: 'dashboards:abc' })).rejects.toThrow('Failed to fetch');
  });
});
