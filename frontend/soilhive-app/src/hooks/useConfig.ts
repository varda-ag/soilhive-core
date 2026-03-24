import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';

const getConfigEndpoint = (id: string) => `/config/${id}`;

export const useConfig = <T>(id: string, defaultConfig?: T) => {
  const queryClient = useQueryClient();
  const endpoint = getConfigEndpoint(id);
  const saveMutation = useApiMutation<{ id: string }, unknown>({
    endpoint,
    method: 'PUT',
  });

  const { data, isLoading, isError } = useApiQuery<T>({
    endpoint,
    method: 'GET',
    queryKey: [endpoint],
    enabled: !!id,
  });

  const config = data ?? defaultConfig;

  const saveConfig = async (newConfig: unknown): Promise<void> => {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    await saveMutation.mutateAsync(newConfig);
  };

  return { config, isLoading, isError, saveConfig };
};
