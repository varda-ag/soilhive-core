import useConfigs from './useConfigs';

const usePluginConfigs = <T>(pluginId: string, ids: string[]) => {
  const prefix = `plugin:${pluginId}:`;
  const { data, isLoading, isError } = useConfigs<T>(ids.map(id => `${prefix}${id}`));

  const unprefixedData = Object.fromEntries(Object.entries(data).map(([id, config]) => [id.slice(prefix.length), config]));

  return { data: unprefixedData, isLoading, isError };
};

export default usePluginConfigs;
