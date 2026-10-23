import type { PluginConfigEntry } from 'frontend-plugin-types';
import useConfigs from './useConfigs';

const usePluginConfigs = <T>(pluginId: string, ids: string[], polling?: number) => {
  const prefix = `plugin:${pluginId}:`;
  const { data, isLoading, isError } = useConfigs<T>(
    ids.map(id => `${prefix}${id}`),
    polling,
  );

  const entries: Record<string, PluginConfigEntry<T>> = Object.fromEntries(
    Object.entries(data).map(([id, saved]) => [id.slice(prefix.length), { config: saved.data, updatedAt: saved.updated_at }]),
  );

  return { data: entries, isLoading, isError };
};

export default usePluginConfigs;
