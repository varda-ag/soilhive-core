import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';

type UseApiQueryOptions<TBody = void> = {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: TBody;
  // It's an array and not an object because it is possible to have duplicate parameter names in URLs
  // and they usually are interpreted as a single parameter that contains an array.
  parameters?: Array<[string, string]>;
  queryKey: QueryKey;
  enabled: boolean;
};

export function useApiQuery<TResponse, TBody = void>({ endpoint, method, body, parameters, queryKey, enabled }: UseApiQueryOptions<TBody>) {
  const { request } = useRequest();

  const url = buildApiUrl(endpoint, parameters);

  const fetchData = async (): Promise<TResponse> => {
    return await request({
      url,
      method,
      body,
    });
  };

  return useQuery({
    queryKey,
    queryFn: fetchData,
    enabled,
    staleTime: 600000, // Caching the responses for 10 minutes (use @tanstack/react-query-devtools for useQuery debugging)
  });
}
