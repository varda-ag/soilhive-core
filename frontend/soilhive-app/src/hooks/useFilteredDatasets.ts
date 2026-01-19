import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import type { DatasetFilter, PostDatasetFilterResponse } from 'types/backend';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export function useFilteredDatasets(filters: DatasetFilter) {
  const { request } = useRequest();
  const debouncedFilters = useDebounce(filters, 300);

  // Simple useDebounce hook
  function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
      const handler = setTimeout(() => setDebouncedValue(value), delay);
      return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
  }

  const fetchFilteredDatasets = async (filter?: DatasetFilter): Promise<PostDatasetFilterResponse> => {
    const res = await request({
      url: `${BACKEND_BASE_URL}/datasets-filters`,
      method: 'POST',
      body: filter,
    });
    return res;
  };

  return useQuery({
    queryKey: ['datasets', debouncedFilters],
    queryFn: () => fetchFilteredDatasets(debouncedFilters),
    enabled: !!debouncedFilters.geometries.length,
  });
}
