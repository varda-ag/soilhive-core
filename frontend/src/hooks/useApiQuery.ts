import { Query, useQuery, type QueryKey } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { buildApiUrl } from '../utilities/buildApiUrl';
import { QUERY_STALE_TIME } from '../configuration/api';

const inflightRequests = new Map<string, Promise<unknown>>();

function buildRequestKey(url: string, method: string, body: unknown): string {
  const bodyPart = body === undefined || body === null ? '' : JSON.stringify(body);
  return `${method}:${url}:${bodyPart}`;
}

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
  isBlobResponse?: boolean;
  abortOnNewQuery?: boolean;
  authenticate?: boolean;
  disableCache?: boolean;
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
  isBlobResponse = false,
  abortOnNewQuery = false,
  authenticate,
  disableCache,
}: UseApiQueryOptions<TResponse, TBody>) {
  const { request } = useRequest();

  const url = buildApiUrl(endpoint, parameters);

  const fetchData = async ({ signal }: { signal: AbortSignal }): Promise<TResponse> => {
    const requestKey = buildRequestKey(url, method, body);
    const existing = inflightRequests.get(requestKey);

    if (existing) {
      return existing as Promise<TResponse>;
    }

    const promise = request({
      url,
      method,
      body,
      signal: abortOnNewQuery ? signal : undefined,
      ignoreAbortError: abortOnNewQuery,
      showErrorNotification,
      notFoundAsNull,
      isBlobResponse,
      authenticate,
    }).finally(() => {
      inflightRequests.delete(requestKey);
    });

    inflightRequests.set(requestKey, promise);
    return promise as Promise<TResponse>;
  };

  return useQuery({
    queryKey,
    queryFn: fetchData,
    enabled,
    staleTime: disableCache ? 0 : QUERY_STALE_TIME,
    refetchInterval,
    retry,
  });
}
