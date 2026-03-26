import { Query, useQuery, type QueryKey } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';
import { QUERY_STALE_TIME } from '../configuration/api';

type UseApiQueryOptions<TResponse, TBody = void> = {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: TBody;
  // It's an array and not an object because it is possible to have duplicate parameter names in URLs
  // and they usually are interpreted as a single parameter that contains an array.
  parameters?: Array<[string, string]>;
  queryKey: QueryKey;
  enabled: boolean;
  refetchInterval?: number | false | ((query: Query<TResponse, Error, TResponse, QueryKey>) => number | false | undefined);
  retry?: boolean | number;
  showErrorNotification?: boolean;
  notFoundAsNull?: boolean;
};

export function useApiQuery<TResponse, TBody = void>({
  endpoint,
  method,
  body,
  parameters,
  queryKey,
  enabled,
  refetchInterval,
  retry,
  showErrorNotification,
  notFoundAsNull,
}: UseApiQueryOptions<TResponse, TBody>) {
  const { request } = useRequest();

  const url = buildApiUrl(endpoint, parameters);

  const fetchData = async (): Promise<TResponse> => {
    return await request({
      url,
      method,
      body,
      showErrorNotification,
      notFoundAsNull,
    });
  };

  return useQuery({
    queryKey,
    queryFn: fetchData,
    enabled,
    staleTime: QUERY_STALE_TIME,
    refetchInterval,
    retry,
  });
}
