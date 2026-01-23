import { useQuery } from '@tanstack/react-query';
import type { DatasetFilter } from 'types/backend';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { useDebounce } from './useDebounce';

type StoredDataFilter = {
  id: string;
  name?: string;
};

export function useCreateDataFilter(filters: DatasetFilter) {
  const { request } = useRequest();
  const debouncedFilters = useDebounce(filters, 300);

  const createDataFilter = async (filter: DatasetFilter): Promise<StoredDataFilter> => {
    const res = await request({
      url: `${BACKEND_BASE_URL}/data-filters`,
      method: 'POST',
      body: filter,
    });
    return res;
  };

  return useQuery({
    queryKey: ['data-filter', debouncedFilters],
    queryFn: () => createDataFilter(debouncedFilters),
    enabled: !!debouncedFilters.geometries.length,
  });
}
