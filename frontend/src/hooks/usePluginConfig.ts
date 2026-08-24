import useConfig from './useConfig';

// ':' keeps the namespaced id within a single URL path segment, matching the
// backend's `/config/{configId}` route. A '/' separator would split into an
// extra path segment and 404. The constant 'plugin:' prefix reserves a
// namespace that the host's own (unprefixed) useConfig calls can never enter.
const usePluginConfig = <T>(pluginId: string, id: string, defaultConfig?: T) => useConfig<T>(`plugin:${pluginId}:${id}`, defaultConfig);

export default usePluginConfig;
