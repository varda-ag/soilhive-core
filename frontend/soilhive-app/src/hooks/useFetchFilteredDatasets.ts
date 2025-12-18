import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import type { DatasetFilter, PostDatasetFilterResponse } from 'types/backend';

export function useFetchFilteredDatasets(filter?: DatasetFilter) {
  const [fetchedFilteredResults, setFetchedFilteredResults] = useState<PostDatasetFilterResponse>();
  const abortControllerRef = useRef<AbortController>(null);
  const { request, loading, error } = useRequest();

  const fetchDatasets = useCallback(
    async (filter?: DatasetFilter) => {

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
        setFetchedFilteredResults(res);
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
    [request],
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
    fetchedFilteredResults,
    loading,
    error,
  };
}
