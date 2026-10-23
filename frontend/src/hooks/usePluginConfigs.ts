import { useMemo } from 'react';
import type { PluginConfigEntry } from 'frontend-plugin-types';
import useConfigs from './useConfigs';

const usePluginConfigs = <T>(pluginId: string, ids: string[], polling?: number) => {
  const prefix = `plugin:${pluginId}:`;
  const { data, isLoading, isError } = useConfigs<T>(
    ids.map(id => `${prefix}${id}`),
    polling,
  );

  // Rebuilt only when useConfigs' data changes, so a poll that returns the same configs keeps every entry.
  const entries: Record<string, PluginConfigEntry<T>> = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(data).map(([id, saved]) => [id.slice(prefix.length), { config: saved.data, updatedAt: saved.updated_at }]),
      ),
    [data, prefix],
  );

  return { data: entries, isLoading, isError };
};

export default usePluginConfigs;
