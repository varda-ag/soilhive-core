import { useMemo } from 'react';
import useConfigs from './useConfigs';

const usePluginConfigs = <T>(pluginId: string, ids: string[], polling?: number) => {
  const prefix = `plugin:${pluginId}:`;
  const { data, isLoading, isError } = useConfigs<T>(
    ids.map(id => `${prefix}${id}`),
    polling,
  );

  // Each entry is useConfigs' own, so it keeps its identity until its config changes.
  const unprefixedData = useMemo(
    () => Object.fromEntries(Object.entries(data).map(([id, entry]) => [id.slice(prefix.length), entry])),
    [data, prefix],
  );

  return { data: unprefixedData, isLoading, isError };
};

export default usePluginConfigs;
