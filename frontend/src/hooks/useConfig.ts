import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { queryClient } from '../App';

const getConfigEndpoint = (id: string) => `/config/${id}`;

const useConfig = <T>(id: string, defaultConfig?: T) => {
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
    showErrorNotification: false,
    notFoundAsNull: true,
    authenticate: false,
  });

  // Backfill top-level keys that are missing in fetched data, keeping stored values
  // where present. (data ?? defaultConfig handles the not-found / null case.)
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

  const config: T | undefined = isObject(data) && isObject(defaultConfig) ? { ...defaultConfig, ...data } : (data ?? defaultConfig);

  const saveConfig = async (newConfig: unknown): Promise<void> => {
    await saveMutation.mutateAsync(newConfig);
    await queryClient.invalidateQueries({ queryKey: [endpoint] });
  };

  return { config, isLoading, isError, saveConfig };
};

export default useConfig;
