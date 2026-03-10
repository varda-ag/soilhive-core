import { useQueries, type QueryKey, type Query } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';

type ApiQueryItem<TResponse, TBody = void> = {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: TBody;
  parameters?: Array<[string, string]>;
  queryKey: QueryKey;
  enabled: boolean;
  refetchInterval?: number | false | ((query: Query<TResponse, Error, TResponse, QueryKey>) => number | false | undefined);
};

export function useApiQueries<TResponse, TBody = void>(queries: ApiQueryItem<TResponse, TBody>[]) {
  const { request } = useRequest();

  return useQueries({
    queries: queries.map(({ endpoint, method, body, parameters, queryKey, enabled, refetchInterval }) => {
      const url = buildApiUrl(endpoint, parameters);

      return {
        queryKey,
        enabled,
        queryFn: async (): Promise<TResponse> => {
          return request({
            url,
            method,
            body,
          });
        },
        staleTime: 600000,
        refetchInterval,
      };
    }),
  });
}
