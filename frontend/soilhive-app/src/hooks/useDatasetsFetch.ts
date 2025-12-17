import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import type { DatasetFilter, PostDatasetFilterResponse } from 'types/backend';

export function useDatasetsFetch(filter?: DatasetFilter, useMock = true) {
  const [fetchedDatasets, setFetchedDatasets] = useState<PostDatasetFilterResponse>();
  const abortControllerRef = useRef<AbortController>(null);
  const { request, loading, error } = useRequest();

  const fetchDatasets = useCallback(
    async (filter?: DatasetFilter) => {
      if (useMock) {
        setFetchedDatasets(MOCK_RESPONSE);
        return MOCK_RESPONSE;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        const res = await request({
          url: `${BACKEND_BASE_URL}/datasets-filters`,
          method: 'POST',
          body: filter,
          signal: abortControllerRef.current.signal,
        });
        setFetchedDatasets(res);
        return res;
      } catch (err) {
        // Don't set error if it was aborted
        if (err instanceof Error) {
          if (err.name !== 'AbortError') throw err;
        } else {
          throw err;
        }
      }
    },
    [request, useMock],
  );

  useEffect(() => {
    if (!filter) return;

    // debounce
    const timeoutId = setTimeout(() => {
      fetchDatasets(filter);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDatasets, filter]);

  return {
    fetchedDatasets,
    loading,
    error,
  };
}

const MOCK_RESPONSE: PostDatasetFilterResponse = {
  id: 'mock-filter-1',
  name: 'Mock Filter',
  geometries: [],
  parameters: {},
  results: [
    {
      datasets: [
        {
          id: 'dataset-1',
          feature_count: 34546,
          min_depth: 0,
          max_depth: 60,
          min_sampling_date: '2012-01-01',
          max_sampling_date: '2025-12-31',
          data_types: ['Global'],
        },
        {
          id: 'dataset-2',
          feature_count: 234546,
          min_depth: 0,
          max_depth: 60,
          min_sampling_date: '2006-01-01',
          max_sampling_date: '2024-12-31',
          data_types: ['Global'],
        },
        {
          id: 'dataset-3',
          feature_count: 14546,
          min_depth: 0,
          max_depth: 60,
          min_sampling_date: '2014-01-01',
          max_sampling_date: '2024-12-31',
          data_types: ['Kenya', 'Private'],
        },
      ],
    },
  ],
};
