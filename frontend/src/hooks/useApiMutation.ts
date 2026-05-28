import { useMutation } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';

type UseApiMutationOptions<TVariables = void> = {
  endpoint: string | ((variables: TVariables) => string);
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: TVariables;
  parameters?: Array<[string, string]>;
  showErrorNotification?: boolean;
};

export function useApiMutation<TResponse, TVariables = void>({
  endpoint,
  method,
  showErrorNotification,
}: UseApiMutationOptions<TVariables>) {
  const { request } = useRequest();

  return useMutation({
    mutationFn: async (variables?: TVariables): Promise<TResponse> => {
      const resolvedEndpoint = typeof endpoint === 'function' ? endpoint(variables as TVariables) : endpoint;
      return request({
        url: `${BACKEND_BASE_URL}${resolvedEndpoint}`,
        method,
        body: variables,
        showErrorNotification,
      }) as Promise<TResponse>;
    },
  });
}
