import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';
import { QUERY_STALE_TIME } from '../configuration/api';
import type { UseApiQueryOptions } from './useApiQuery';

// The useApiQuery options this hook handles; `authenticate` stays out (see useConfigs).
export type UseApiQueriesOptionsItem<TResponse, TBody = void> = Pick<
  UseApiQueryOptions<TResponse, TBody>,
  | 'endpoint'
  | 'method'
  | 'body'
  | 'parameters'
  | 'queryKey'
  | 'enabled'
  | 'refetchInterval'
  | 'retry'
  | 'staleTime'
  | 'showErrorNotification'
  | 'notFoundAsNull'
>;

// `combine` maps the results to one value that keeps its identity until a result changes.
export function useApiQueries<TResponse, TBody = void, TCombined = UseQueryResult<TResponse, Error>[]>(
  queries: UseApiQueriesOptionsItem<TResponse, TBody>[],
  combine?: (results: UseQueryResult<TResponse, Error>[]) => TCombined,
): TCombined {
  const { request } = useRequest();

  return useQueries({
    queries: queries.map(
      ({
        endpoint,
        method,
        body,
        parameters,
        queryKey,
        enabled,
        refetchInterval,
        retry,
        staleTime,
        showErrorNotification,
        notFoundAsNull,
      }) => {
        const url = buildApiUrl(endpoint, parameters);

        return {
          queryKey,
          enabled,
          queryFn: async (): Promise<TResponse> => {
            return request({
              url,
              method,
              body,
              showErrorNotification,
              notFoundAsNull,
            });
          },
          staleTime: staleTime ?? QUERY_STALE_TIME,
          refetchInterval,
          retry,
        };
      },
    ),
    combine,
  });
}
