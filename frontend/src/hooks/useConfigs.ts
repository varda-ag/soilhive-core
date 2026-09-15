import { useApiQuery } from './useApiQuery';

const useConfigs = <T>(ids: string[]) => {
  const { data, isLoading, isError } = useApiQuery<Record<string, T>>({
    endpoint: '/config',
    method: 'GET',
    parameters: [['ids', ids.join(',')]],
    queryKey: ['/config', ids],
    enabled: ids.length > 0,
    authenticate: false,
  });

  return { data: data ?? {}, isLoading, isError };
};

export default useConfigs;
