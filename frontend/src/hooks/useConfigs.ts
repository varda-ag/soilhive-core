import { useApiQueries } from './useApiQueries';

// Matches maxItems of the ids parameter on GET /configs.
const CONFIGS_BATCH_SIZE = 100;

const toBatches = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / CONFIGS_BATCH_SIZE) }, (_, i) =>
    ids.slice(i * CONFIGS_BATCH_SIZE, (i + 1) * CONFIGS_BATCH_SIZE),
  );

const useConfigs = <T>(ids: string[], polling?: number) => {
  // GET /configs is entitlements-gated (READ/WRITE, or EVERYONE's grant), and the backend
  // validates an Authorization header whenever one is sent — so this must NOT force
  // authenticate: false. Omitting it sends the caller's token when they're logged in (needed to
  // read their own entitled configs), while still sending none when they're not.
  const results = useApiQueries<Record<string, T>>(
    toBatches(ids).map(batch => ({
      endpoint: '/configs',
      method: 'GET',
      parameters: [['ids', batch.join(',')]],
      queryKey: ['/configs', batch],
      enabled: true,
      refetchInterval: polling || false,
    })),
  );

  const data = Object.assign({}, ...results.map(result => result.data)) as Record<string, T>;

  return { data, isLoading: results.some(result => result.isLoading), isError: results.some(result => result.isError) };
};

export default useConfigs;
