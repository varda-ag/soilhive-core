import useConfig from './useConfig';
import { buildPluginConfigId } from './pluginConfigId';

const usePluginConfig = <T>(pluginId: string, id: string, defaultConfig?: T) =>
  useConfig<T>(buildPluginConfigId(pluginId, id), defaultConfig);

export default usePluginConfig;
