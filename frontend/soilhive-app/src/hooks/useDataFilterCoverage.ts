import { useQuery } from '@tanstack/react-query';
import type { PostDatasetFilterResponse } from 'types/backend';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';

export function useDataFilterCoverage(filterId: string | undefined) {
  const { request } = useRequest();

  const fetchCoverage = async (id: string): Promise<PostDatasetFilterResponse> => {
    const res = await request({
      url: `${BACKEND_BASE_URL}/data-filters/${id}/coverage`,
      method: 'GET',
    });
    return res;
  };

  return useQuery({
    queryKey: ['data-filter-coverage', filterId],
    queryFn: () => fetchCoverage(filterId!),
    enabled: !!filterId,
  });
}
