import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useDatasets } from 'hooks/useDatasets';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(),
}));

jest.mock('../../src/utilities/buildApiUrl', () => ({
  buildApiUrl: jest.fn(() => 'http://test.url/datasets'),
}));

jest.mock('../../src/configuration/api', () => ({
  QUERY_STALE_TIME: 600000,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useDatasets background refetch behaviour', () => {
  const requestMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRequest as jest.Mock).mockReturnValue({ request: requestMock });
  });

  it('reports isLoading true only on the very first fetch, not on background polls', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const firstFetch = deferred<unknown[]>();
    requestMock.mockReturnValueOnce(firstFetch.promise);

    const { result } = renderHook(() => useDatasets(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    firstFetch.resolve([{ id: '1', status: 'PENDING' }]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.datasets).toEqual([{ id: '1', status: 'PENDING' }]);

    const backgroundFetch = deferred<unknown[]>();
    requestMock.mockReturnValueOnce(backgroundFetch.promise);

    act(() => {
      queryClient.refetchQueries({ queryKey: ['datasets'] });
    });

    expect(result.current.isLoading).toBe(false);

    backgroundFetch.resolve([{ id: '1', status: 'ONGOING' }]);

    await waitFor(() => {
      expect(result.current.datasets).toEqual([{ id: '1', status: 'ONGOING' }]);
    });
    expect(result.current.isLoading).toBe(false);
  });
});
