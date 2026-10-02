import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import usePluginConfigDelete from 'hooks/usePluginConfigDelete';
import { usePluginConfigEntitlements } from 'hooks/usePluginConfigEntitlements';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({
  ...jest.requireActual('../../src/configuration/api'),
  BACKEND_BASE_URL: 'https://api.example.com',
}));

const GRANTS_URL = 'https://api.example.com/configs/plugin:acme:dashboards:abc/entitlements';
const grants = { alice: ['read', 'write'], bob: ['read'] };

// The backend's answers: once the item is deleted, its grants go with it and reading them is a 403.
let isDeleted = false;
const request = jest.fn(async ({ url, method }: { url: string; method: string }) => {
  if (method === 'DELETE') {
    isDeleted = true;
    return null;
  }
  if (url === GRANTS_URL) {
    if (isDeleted) {
      throw Object.assign(new Error('HTTP 403'), { status: 403 });
    }
    return grants;
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
});
(useRequest as jest.Mock).mockReturnValue({ request });

const grantsRequests = () => request.mock.calls.filter(([{ url }]) => url === GRANTS_URL).length;

// A real QueryClient, with React Query's default retries: the mocked one in usePluginConfigDelete.test.ts
// cannot show that a failed refetch keeps the old data.
describe('usePluginConfigDelete with an open sharing panel', () => {
  it("drops the deleted item's grants from the panel, without waiting out retries", async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ panel: usePluginConfigEntitlements('acme', 'dashboards:abc'), deleteConfig: usePluginConfigDelete('acme') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.panel.data).toEqual(grants));

    await act(() => result.current.deleteConfig.mutateAsync({ id: 'dashboards:abc' }));

    // Settled in the cache by now; React Query re-renders observers a tick later.
    expect(queryClient.getQueryData(['config-entitlements', 'plugin:acme:dashboards:abc'])).toBeUndefined();
    await waitFor(() => expect(result.current.panel.isError).toBe(true));
    expect(result.current.panel.data).toBeUndefined();
    // The first read, then one refetch: the 403 is not retried.
    expect(grantsRequests()).toBe(2);
  });
});
