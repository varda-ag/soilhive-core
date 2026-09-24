import { useApiQuery } from './useApiQuery';

const useConfigs = <T>(ids: string[]) => {
  // GET /config is entitlements-gated (READ/WRITE, or EVERYONE's grant), and the backend
  // validates an Authorization header whenever one is sent — so this must NOT force
  // authenticate: false. Omitting it sends the caller's token when they're logged in (needed to
  // read their own entitled configs), while still sending none when they're not.
  const { data, isLoading, isError } = useApiQuery<Record<string, T>>({
    endpoint: '/config',
    method: 'GET',
    parameters: [['ids', ids.join(',')]],
    queryKey: ['/config', ids],
    enabled: ids.length > 0,
  });

  return { data: data ?? {}, isLoading, isError };
};

export default useConfigs;
