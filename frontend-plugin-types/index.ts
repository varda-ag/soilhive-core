import type { PluginConfigResult, PluginQueryResult, PluginUser } from './common';
import type { PluginMapSelection } from './map';
import type { PluginDataFilterInput, PluginFilteredData } from './filter';
import type {
  PluginRasterFilterCategory,
  PluginSoilDataParameters,
  PluginSoilDataResult,
  PluginSoilProperty,
  PluginSoilPropertyCategory,
} from './soil';
import type { PluginTheme } from './theme';

export * from './common';
export * from './map';
export * from './theme';
export * from './filter';
export * from './soil';

export interface PluginContext {
  user?: PluginUser | null;
  mapSelection?: PluginMapSelection;
  useTheme: () => PluginQueryResult<PluginTheme>;
  useDataFilterQuery: (filters: PluginDataFilterInput, enabled?: boolean, debounceTime?: number) => PluginQueryResult<string>;
  useFilteredCoverageQuery: (filterId: string | undefined, geometryOnly?: boolean) => PluginQueryResult<PluginFilteredData>;
  useSoilProperties: () => PluginQueryResult<PluginSoilProperty[]>;
  usePropertiesCategories: () => PluginQueryResult<PluginSoilPropertyCategory[]>;
  useRasterCategories: () => PluginQueryResult<PluginRasterFilterCategory[]>;
  useSoilData: (parameters: PluginSoilDataParameters) => PluginSoilDataResult;
  // pluginId is the plugin's own exported id (see plugin-development.md), passed
  // back in so the same config namespace is used no matter which plugin calls it.
  usePluginConfig: <T>(pluginId: string, id: string, defaultConfig?: T) => PluginConfigResult<T>;
}
