import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';

type UseApiQueryOptions<TBody = void> = {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: TBody;
  queryKey: QueryKey;
  enabled: boolean;
};

export function useApiQuery<TResponse, TBody = void>({ endpoint, method, body, queryKey, enabled }: UseApiQueryOptions<TBody>) {
  const { request } = useRequest();

  const fetchData = async (): Promise<TResponse> => {
    return await request({
      url: `${BACKEND_BASE_URL}${endpoint}`,
      method,
      body,
    });
  };

  return useQuery({
    queryKey,
    queryFn: fetchData,
    enabled,
  });
}
