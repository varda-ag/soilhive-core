import { useQuery } from '@tanstack/react-query';
import type { DatasetFilter, PostDatasetFilterResponse } from 'types/backend';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useDebounce } from './useDebounce';

export function useFilteredDatasets(filters: DatasetFilter) {
  const { request } = useRequest();
  const debouncedFilters = useDebounce(filters, 300);

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
