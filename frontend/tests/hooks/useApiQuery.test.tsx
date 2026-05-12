import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useApiQuery } from 'hooks/useApiQuery';
import { useRequest } from '../../src/api-client';
import { buildApiUrl } from '../../src/utilities/buildApiUrl';

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(),
}));

jest.mock('../../src/utilities/buildApiUrl', () => ({
  buildApiUrl: jest.fn(),
}));

jest.mock('../../src/configuration/api', () => ({
  QUERY_STALE_TIME: 600000,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useApiQuery', () => {
  const requestMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useRequest as jest.Mock).mockReturnValue({
      request: requestMock,
    });

    (buildApiUrl as jest.Mock).mockImplementation((endpoint, parameters) => {
      const base = `http://test.url${endpoint}`;

      if (!parameters?.length) {
        return base;
      }

      const url = new URL(base);
      for (const [key, value] of parameters) {
        url.searchParams.append(key, value);
      }

      return url.href;
    });
  });

  it('calls buildApiUrl with endpoint and parameters', async () => {
    requestMock.mockResolvedValueOnce({ id: '1', name: 'job' });

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQuery({
          endpoint: '/test',
          method: 'GET',
          parameters: [['status', 'created']],
          queryKey: ['test'],
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    expect(buildApiUrl).toHaveBeenCalledWith('/test', [['status', 'created']]);
  });

  it('calls request with built url, method and body', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });
    (buildApiUrl as jest.Mock).mockReturnValueOnce('http://test.url/test?status=created');

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQuery<{ ok: boolean }, { foo: string }>({
          endpoint: '/test',
          method: 'POST',
          body: { foo: 'bar' },
          parameters: [['status', 'created']],
          queryKey: ['test'],
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    expect(requestMock).toHaveBeenCalledWith({
      url: 'http://test.url/test?status=created',
      method: 'POST',
      body: { foo: 'bar' },
      signal: undefined,
      ignoreAbortError: false,
      isBlobResponse: false,
    });
  });

  it('returns fetched data', async () => {
    const response = { id: '123', status: 'created' };
    requestMock.mockResolvedValueOnce(response);

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiQuery<{ id: string; status: string }>({
          endpoint: '/test/123',
          method: 'GET',
          queryKey: ['test', '123'],
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(response);
  });

  it('does not fetch when enabled is false', async () => {
    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiQuery({
          endpoint: '/test',
          method: 'GET',
          queryKey: ['test'],
          enabled: false,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('passes signal and ignoreAbortError when abortOnNewQuery is true', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });
    (buildApiUrl as jest.Mock).mockReturnValueOnce('http://test.url/test');

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQuery({
          endpoint: '/test',
          method: 'GET',
          queryKey: ['test'],
          enabled: true,
          abortOnNewQuery: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        ignoreAbortError: true,
      }),
    );
  });

  it('passes no signal and ignoreAbortError false when abortOnNewQuery is false', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });
    (buildApiUrl as jest.Mock).mockReturnValueOnce('http://test.url/test');

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQuery({
          endpoint: '/test',
          method: 'GET',
          queryKey: ['test'],
          enabled: true,
          abortOnNewQuery: false,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: undefined,
        ignoreAbortError: false,
      }),
    );
  });

  it('uses staleTime of 600000 and does not refetch on rerender with same key', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' });

    const wrapper = createWrapper();

    const { rerender } = renderHook(
      () =>
        useApiQuery({
          endpoint: '/test/1',
          method: 'GET',
          queryKey: ['test', '1'],
          enabled: true,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    rerender();

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});
