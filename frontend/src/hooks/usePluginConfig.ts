import useConfig from './useConfig';

// ':' keeps the namespaced id within a single URL path segment, matching the
// backend's `/config/{configId}` route. A '/' separator would split into an
// extra path segment and 404.
const usePluginConfig = <T>(pluginId: string, id: string, defaultConfig?: T) => useConfig<T>(`${pluginId}:${id}`, defaultConfig);

export default usePluginConfig;
