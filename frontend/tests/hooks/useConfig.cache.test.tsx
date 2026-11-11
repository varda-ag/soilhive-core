import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useConfig from 'hooks/useConfig';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { useRequest } from '../../src/api-client';
import { queryClientWrapper } from '../queryClientWrapper';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('hooks/useEntitlementsHook', () => ({ useEntitlements: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({
  ...jest.requireActual('../../src/configuration/api'),
  BACKEND_BASE_URL: 'https://api.example.com',
}));

const CONFIG_URL = 'https://api.example.com/configs/plugin:acme:';

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

// A real QueryClient: the mocked one in useConfig.test.ts cannot show that other observers of the
// same config get the saved value.
describe('useConfig with two observers of the same config', () => {
  it('shows the saved config in both, with no refetch after the PUT', async () => {
    const { result } = renderHook(
      () => ({ editor: useConfig<{ title: string }>('plugin:acme:widget'), viewer: useConfig<{ title: string }>('plugin:acme:widget') }),
      { wrapper: queryClientWrapper },
    );
    await waitFor(() => expect(result.current.viewer.config).toEqual({ title: 'before' }));

    await act(() => result.current.editor.saveConfig({ title: 'after' }));

    await waitFor(() => expect(result.current.viewer.config).toEqual({ title: 'after' }));
    // The one GET at mount only.
    expect(request.mock.calls.filter(([{ method }]) => method === 'GET')).toHaveLength(1);
  });

  it('keeps the saved config when a GET that started before the PUT finishes after it', async () => {
    stored = { title: 'before' };
    // The GET reads the server before the PUT, but its response arrives after the save.
    let releaseGet: () => void = () => {};
    request.mockImplementationOnce(async () => {
      const readBeforePut = stored;
      await new Promise<void>(resolve => (releaseGet = resolve));
      return readBeforePut;
    });
    const { result } = renderHook(() => useConfig<{ title: string }>('plugin:acme:slow'), { wrapper: queryClientWrapper });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' })));

    await act(() => result.current.saveConfig({ title: 'after' }));
    await act(async () => releaseGet());
    // React Query notifies observers on the next tick.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));

    expect(result.current.config).toEqual({ title: 'after' });
  });
});

// Retries without delay, so a retry would show as a second GET at once.
const noDelayWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}>{children}</QueryClientProvider>
);

describe('useConfig on a failed GET', () => {
  beforeEach(() => request.mockClear());

  it('exposes a 403 with its body after one request', async () => {
    const body = { status: 403, datasets: ['ds-x'], has_unavailable_datasets: false };
    request.mockRejectedValueOnce({ status: 403, raw: body });
    const { result } = renderHook(() => useConfig('plugin:acme:dashboards:1'), { wrapper: noDelayWrapper });

    await waitFor(() => expect(result.current.error).toEqual({ status: 403, body }));
    expect(result.current.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries another failure', async () => {
    request.mockRejectedValue({ status: 500, raw: null });
    const { result } = renderHook(() => useConfig('plugin:acme:failing'), { wrapper: noDelayWrapper });

    await waitFor(() => expect(result.current.error).toEqual({ status: 500, body: null }));
    expect(request).toHaveBeenCalledTimes(4);
    request.mockReset();
  });

  it('returns the default config and no error on a 404 (read as null)', async () => {
    request.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useConfig('plugin:acme:missing', { title: 'default' }), { wrapper: noDelayWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.config).toEqual({ title: 'default' });
    expect(result.current.error).toBeUndefined();
  });
});
