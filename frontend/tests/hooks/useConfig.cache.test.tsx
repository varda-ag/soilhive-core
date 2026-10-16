import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useConfig from 'hooks/useConfig';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('hooks/useEntitlementsHook', () => ({ useEntitlements: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({
  ...jest.requireActual('../../src/configuration/api'),
  BACKEND_BASE_URL: 'https://api.example.com',
}));

const CONFIG_URL = 'https://api.example.com/configs/plugin:acme:widget';

// The backend's answers: PUT returns the stored config, the same body a GET returns.
let stored: unknown = { title: 'before' };
const request = jest.fn(async ({ url, method, body }: { url: string; method: string; body?: unknown }) => {
  if (!url.startsWith(CONFIG_URL)) {
    throw new Error(`Unexpected request: ${method} ${url}`);
  }
  if (method === 'PUT') {
    stored = body;
  }
  return stored;
});
(useRequest as jest.Mock).mockReturnValue({ request });
(useEntitlements as jest.Mock).mockReturnValue({ can: () => true });

const configGets = () => request.mock.calls.filter(([{ method }]) => method === 'GET').length;

// A real QueryClient: the mocked one in useConfig.test.ts cannot show that other observers of the
// same config get the saved value.
describe('useConfig with two observers of the same config', () => {
  it('shows the saved config in both, with no refetch after the PUT', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ editor: useConfig<{ title: string }>('plugin:acme:widget'), viewer: useConfig<{ title: string }>('plugin:acme:widget') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.viewer.config).toEqual({ title: 'before' }));

    await act(() => result.current.editor.saveConfig({ title: 'after' }));

    await waitFor(() => expect(result.current.viewer.config).toEqual({ title: 'after' }));
    // The one GET at mount only.
    expect(configGets()).toBe(1);
  });
});
