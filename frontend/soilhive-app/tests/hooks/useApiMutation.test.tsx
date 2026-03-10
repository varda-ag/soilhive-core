import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useApiMutation } from 'hooks/useApiMutation';
import { useRequest } from '../../src/api-client';
import { BACKEND_BASE_URL } from '../../src/configuration/api';

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(),
}));
jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'https://test.url',
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useApiMutation', () => {
  const requestMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useRequest as jest.Mock).mockReturnValue({
      request: requestMock,
    });
  });

  it('calls request with a static endpoint', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<{ id: string }, { name: string }>({
          endpoint: '/test',
          method: 'POST',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'test-job' });
    });

    expect(requestMock).toHaveBeenCalledWith({
      url: `${BACKEND_BASE_URL}/test`,
      method: 'POST',
      body: { name: 'test-job' },
    });
  });

  it('calls request with a dynamic endpoint', async () => {
    requestMock.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<void, { jobId: string }>({
          endpoint: ({ jobId }) => `/test/${jobId}`,
          method: 'DELETE',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ jobId: '123' });
    });

    expect(requestMock).toHaveBeenCalledWith({
      url: `${BACKEND_BASE_URL}/test/123`,
      method: 'DELETE',
      body: { jobId: '123' },
    });
  });

  it('returns mutation result data', async () => {
    const response = { id: '42', status: 'created' };
    requestMock.mockResolvedValueOnce(response);

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<{ id: string; status: string }, { format: string }>({
          endpoint: '/test',
          method: 'POST',
        }),
      { wrapper },
    );

    let data: { id: string; status: string } | undefined;

    await act(async () => {
      data = await result.current.mutateAsync({ format: 'csv' });
    });

    expect(data).toEqual(response);
  });

  it('sets success state after successful mutation', async () => {
    requestMock.mockResolvedValueOnce({ id: '1' });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<{ id: string }, { foo: string }>({
          endpoint: '/test',
          method: 'POST',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ foo: 'bar' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('sets error state when request fails', async () => {
    const error = new Error('Request failed');
    requestMock.mockRejectedValueOnce(error);

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<void, { foo: string }>({
          endpoint: '/test',
          method: 'POST',
        }),
      { wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ foo: 'bar' })).rejects.toThrow('Request failed');
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('passes undefined body when mutateAsync is called without variables', async () => {
    requestMock.mockResolvedValueOnce({ ok: true });

    const wrapper = createWrapper();

    const { result } = renderHook(
      () =>
        useApiMutation<{ ok: boolean }>({
          endpoint: '/test',
          method: 'POST',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(requestMock).toHaveBeenCalledWith({
      url: `${BACKEND_BASE_URL}/test`,
      method: 'POST',
      body: undefined,
    });
  });
});
