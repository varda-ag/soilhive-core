import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSoilData } from 'hooks/useSoilData';
import { useRequest } from '../../src/api-client';
import type { SoilDataParameters, SoilDataSample } from 'types/backend';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/utilities/buildApiUrl', () => ({
  buildApiUrl: (endpoint: string, parameters: [string, string][]) => `${endpoint}?${new URLSearchParams(parameters)}`,
}));

const row = (id: string) => ({ id, cursor: id }) as SoilDataSample;

// Pages by `${filterId}:${cursor}`
const pages: Record<string, SoilDataSample[]> = {
  'A:': [row('a1'), row('a2')],
  'A:a2': [row('a3')],
  'A:a3': [],
  'B:': [],
  'C:': [row('c1')],
};

const requestMock = jest.fn(async ({ url }: { url: string }) => {
  const query = new URLSearchParams(url.split('?')[1]);
  return pages[`${query.get('filterId')}:${query.get('cursor') ?? ''}`];
});

const params = (filterId?: string): SoilDataParameters => ({ availableDatasets: ['ds-1'], filterId, limit: 2 });
const ids = (data: SoilDataSample[]) => data.map(sample => sample.id);

function renderSoilData(initialFilterId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook((props: SoilDataParameters) => useSoilData(props), { wrapper, initialProps: params(initialFilterId) });
}

async function loadAllOfFilterA() {
  const hook = renderSoilData('A');
  await waitFor(() => expect(ids(hook.result.current.allData)).toEqual(['a1', 'a2']));
  act(() => hook.result.current.loadMore());
  await waitFor(() => expect(ids(hook.result.current.allData)).toEqual(['a1', 'a2', 'a3']));
  return hook;
}

describe('useSoilData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRequest as jest.Mock).mockReturnValue({ request: requestMock });
  });

  it('appends the next page on loadMore, and stops at an empty one', async () => {
    const { result } = await loadAllOfFilterA();
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(ids(result.current.allData)).toEqual(['a1', 'a2', 'a3']);

    act(() => result.current.loadMore());
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  // SP-5749: after loading more pages, a filter matching nothing kept showing the first page
  it('drops the loaded pages when the filter changes to one matching nothing', async () => {
    const { result, rerender } = await loadAllOfFilterA();

    rerender(params(undefined)); // the new filter is pending
    rerender(params('B'));

    await waitFor(() =>
      expect(requestMock).toHaveBeenLastCalledWith(expect.objectContaining({ url: expect.stringContaining('filterId=B') })),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allData).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('shows only the new filter rows when the filter changes', async () => {
    const { result, rerender } = await loadAllOfFilterA();

    rerender(params('C'));

    await waitFor(() => expect(ids(result.current.allData)).toEqual(['c1']));
  });

  it('keeps only the first page on reset', async () => {
    const { result } = await loadAllOfFilterA();

    act(() => result.current.reset());

    // Query observers are notified on a setTimeout(0), which a sync act does not flush
    await waitFor(() => expect(ids(result.current.allData)).toEqual(['a1', 'a2']));
  });

  it('does not fetch without a filter or datasets', () => {
    renderSoilData(undefined);
    renderHook(() => useSoilData({ availableDatasets: [], filterId: 'A', limit: 2 }), {
      wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
    });

    expect(requestMock).not.toHaveBeenCalled();
  });
});
