import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useApiQueries } from 'hooks/useApiQueries';
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

describe('useApiQueries', () => {
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

  it('calls buildApiUrl for each query', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' }).mockResolvedValueOnce({ id: '2' });

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQueries<{ id: string }>([
          {
            endpoint: '/test/1',
            method: 'GET',
            queryKey: ['test', '1'],
            enabled: true,
            parameters: [['foo', 'bar']],
          },
          {
            endpoint: '/test/2',
            method: 'GET',
            queryKey: ['test', '2'],
            enabled: true,
          },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    expect(buildApiUrl).toHaveBeenNthCalledWith(1, '/test/1', [['foo', 'bar']]);
    expect(buildApiUrl).toHaveBeenNthCalledWith(2, '/test/2', undefined);
  });

  it('calls request with built url, method and body for each enabled query', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' }).mockResolvedValueOnce({ id: '2' });

    (buildApiUrl as jest.Mock).mockReturnValueOnce('http://test.url/test/1').mockReturnValueOnce('http://test.url/test/2');

    const wrapper = createWrapper();

    renderHook(
      () =>
        useApiQueries<{ id: string }, { foo: string }>([
          {
            endpoint: '/test/1',
            method: 'POST',
            body: { foo: 'bar' },
            queryKey: ['test', '1'],
            enabled: true,
          },
          {
            endpoint: '/test/2',
            method: 'GET',
            queryKey: ['test', '2'],
            enabled: true,
          },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    expect(requestMock).toHaveBeenNthCalledWith(1, {
      url: 'http://test.url/test/1',
      method: 'POST',
      body: { foo: 'bar' },
    });

    expect(requestMock).toHaveBeenNthCalledWith(2, {
      url: 'http://test.url/test/2',
      method: 'GET',
      body: undefined,
    });
  });

  it('returns query results in the same order as input queries', async () => {
    requestMock.mockResolvedValueOnce({ id: '1', status: 'created' }).mockResolvedValueOnce({ id: '2', status: 'completed' });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiQueries<{ id: string; status: string }>([
          {
            endpoint: '/test/1',
            method: 'GET',
            queryKey: ['test', '1'],
            enabled: true,
          },
          {
            endpoint: '/test/2',
            method: 'GET',
            queryKey: ['test', '2'],
            enabled: true,
          },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: '1', status: 'created' });
    expect(result.current[1].data).toEqual({ id: '2', status: 'completed' });
  });

  it('does not fetch disabled queries', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiQueries<{ id: string }>([
          {
            endpoint: '/test/1',
            method: 'GET',
            queryKey: ['test', '1'],
            enabled: true,
          },
          {
            endpoint: '/test/2',
            method: 'GET',
            queryKey: ['test', '2'],
            enabled: false,
          },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current[1].fetchStatus).toBe('idle');
  });

  it('returns an empty array when no queries are provided', () => {
    const wrapper = createWrapper();

    const { result } = renderHook(() => useApiQueries<unknown>([]), {
      wrapper,
    });

    expect(result.current).toEqual([]);
    expect(requestMock).not.toHaveBeenCalled();
    expect(buildApiUrl).not.toHaveBeenCalled();
  });
});
