import type { SoilDataParameters, SoilDataSample } from 'types/backend';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';

export function useSoilData(parameters: SoilDataParameters) {
  const { selectedDatasets, availableDatasets, filterId, limit, sort } = parameters;
  const { request } = useRequest<SoilDataSample[]>();
  const queryClient = useQueryClient();

  const datasets = (selectedDatasets ?? availableDatasets).join(',');
  // Pages belong to the parameters that fetched them, so new parameters start from an empty list
  const queryKey = ['soil-data', { datasets, limit, filterId, sort }];

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params: [string, string][] = [
        ['datasets', datasets],
        ['limit', `${limit}`],
      ];
      if (filterId) params.push(['filterId', filterId]);
      if (pageParam) params.push(['cursor', pageParam]);
      if (sort) params.push(['sort', sort]);
      return (await request({ url: buildApiUrl('/soil-data', params), method: 'GET' })) ?? [];
    },
    initialPageParam: undefined as string | undefined,
    // An empty page ends the data
    getNextPageParam: lastPage => lastPage[lastPage.length - 1]?.cursor,
    // The API would return an error without datasets
    enabled: datasets.length > 0 && filterId !== undefined,
    // A refetch reloads every loaded page, so it never happens automatically. The entry is dropped
    // gcTime after the last observer leaves, so a later visit starts fresh.
    staleTime: Infinity,
  });

  const allData = useMemo(() => data?.pages.flat() ?? [], [data]);

  function loadMore() {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }

  // Keeps only the first page. Not needed on a parameter change: kept for the plugin contract.
  function reset() {
    queryClient.setQueryData<InfiniteData<SoilDataSample[], string | undefined>>(
      queryKey,
      prev => prev && { pages: prev.pages.slice(0, 1), pageParams: prev.pageParams.slice(0, 1) },
    );
  }

  return { allData, isLoading: isLoading || isFetchingNextPage, hasMore: hasNextPage, loadMore, reset };
}
