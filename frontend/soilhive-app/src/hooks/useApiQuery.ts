import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';

// type UseApiQueryOptions<TBody = void> = {
//   endpoint: string;
//   method: 'GET' | 'POST';
//   body?: TBody;
//   queryKey: QueryKey;
//   enabled: boolean;
// };

// export function useApiQuery<TResponse, TBody = void>({ endpoint, method, body, queryKey, enabled }: UseApiQueryOptions<TBody>) {
//   const { request } = useRequest();

//   const fetchData = async (): Promise<TResponse> => {
//     return await request({
//       url: `${BACKEND_BASE_URL}${endpoint}`,
//       method,
//       body,
//     });
//   };

//   return useQuery({
//     queryKey,
//     queryFn: fetchData,
//     enabled,
//     staleTime: 600000, // Caching the responses for 10 minutes (use @tanstack/react-query-devtools for useQuery debugging)
//   });
// }

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

  let url = `${BACKEND_BASE_URL}${endpoint}`;
  if (parameters) {
    const urlObj = new URL(url);
    for (const parameter of parameters) {
      urlObj.searchParams.append(parameter[0], parameter[1]);
    }
    url = urlObj.href;
  }

  const fetchData = async (): Promise<TResponse> => {
    return await request({
      url,
      method,
      body,
    });
  };

  return useQuery({
    // queryKey: parameters && parameters.length > 0 ? [...queryKey, ...url] : queryKey,
    queryKey,
    queryFn: fetchData,
    enabled,
    staleTime: 600000, // Caching the responses for 10 minutes (use @tanstack/react-query-devtools for useQuery debugging)
  });
}
