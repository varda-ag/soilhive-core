import type { UseQueryResult } from '@tanstack/react-query';
import type { PluginConfigEntry } from 'frontend-plugin-types';
import type { SavedConfig } from 'types/backend';
import { useApiQueries } from './useApiQueries';

// Matches maxItems of the ids parameter on GET /configs.
const CONFIGS_BATCH_SIZE = 100;

const toBatches = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / CONFIGS_BATCH_SIZE) }, (_, i) =>
    ids.slice(i * CONFIGS_BATCH_SIZE, (i + 1) * CONFIGS_BATCH_SIZE),
  );

const useConfigs = <T>(ids: string[], polling?: number) => {
  // GET /configs is entitlements-gated (READ/WRITE, or EVERYONE's grant): useApiQueries sends the
  // caller's token when they're logged in, which is needed to read their own entitled configs.
  // If useApiQueries ever gains an authenticate option, these queries must not set it to false,
  // or a logged-in caller's non-EVERYONE configs are silently left out.
  return useApiQueries(
    toBatches(ids).map(batch => ({
      endpoint: '/configs',
      method: 'GET',
      parameters: [['ids', batch.join(',')]],
      queryKey: ['/configs', batch],
      enabled: true,
      refetchInterval: polling || false,
    })),
    // React Query shares the combined result structurally: an entry keeps its identity until that
    // config changes, so saving one config does not replace the others.
    (results: UseQueryResult<Record<string, SavedConfig<T>>>[]) => ({
      data: Object.fromEntries(
        results
          .flatMap(result => Object.entries(result.data ?? {}))
          .map(([id, saved]): [string, PluginConfigEntry<T>] => [id, { config: saved.data, updatedAt: saved.updated_at }]),
      ),
      isLoading: results.some(result => result.isLoading),
      isError: results.some(result => result.isError),
    }),
  );
};

export default useConfigs;
