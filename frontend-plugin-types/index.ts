import type {
  PluginConfigEntitlements,
  PluginConfigResult,
  PluginEntitlementScope,
  PluginMutationResult,
  PluginQueryResult,
  PluginUser,
} from './common';
import type { PluginMapSelection } from './map';
import type { PluginDataFilterInput, PluginFilteredData } from './filter';
import type {
  PluginDataset,
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
  useVisibleDatasets: () => PluginQueryResult<PluginDataset[]>;
  useSoilData: (parameters: PluginSoilDataParameters) => PluginSoilDataResult;
  // pluginId is the plugin's own exported id (see plugin-development.md), passed
  // back in so the same config namespace is used no matter which plugin calls it.
  usePluginConfig: <T>(pluginId: string, id: string, defaultConfig?: T) => PluginConfigResult<T>;
  // Read-only batch counterpart to usePluginConfig: fetches multiple ids in one
  // request. Missing ids are simply absent from the returned map.
  usePluginConfigs: <T>(pluginId: string, ids: string[]) => PluginQueryResult<Record<string, T>>;
  usePluginConfigEntitlements: (pluginId: string, configId: string) => PluginQueryResult<PluginConfigEntitlements>;
  usePluginConfigEntitlementsMutation: (
    pluginId: string,
    configId: string,
  ) => PluginMutationResult<PluginConfigEntitlements, PluginConfigEntitlements>;
  // Filtered to the calling plugin's own plugin:{pluginId}: namespace and unprefixed
  // (see ADR 0036) — a plugin never sees another plugin's or the host's entitlements.
  usePluginUserEntitlements: (pluginId: string, scope: PluginEntitlementScope) => PluginQueryResult<PluginConfigEntitlements>;
  // Absolute URL of a dataset's metadata page. Provided by the host because the
  // origin comes from its runtime configuration, which a remote plugin cannot read.
  metadataUrl: (datasetId: string) => string;
}
