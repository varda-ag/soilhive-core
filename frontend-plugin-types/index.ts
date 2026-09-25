import type {
  PluginConfigEntitlements,
  PluginConfigResult,
  PluginEntitlementScope,
  PluginMutationResult,
  PluginQueryResult,
  PluginUser,
} from './common';
import type { PluginDataRequest, PluginDataRequestResult, PluginDataRequestSubmission } from './dataRequest';
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
export * from './dataRequest';

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
  // Data Requests are attached to one of the plugin's config items, which must already be saved:
  // read on it is needed to read them, write to submit or delete them (see ADR 0041). The plugin
  // stores the returned id and deletes it itself; the host never deletes one.
  useDataRequestSubmit: (pluginId: string, configId: string) => PluginMutationResult<PluginDataRequestSubmission, PluginDataRequest>;
  // Polls until completed or failed; undefined id = do not fetch.
  useDataRequest: (id: string | undefined) => PluginDataRequestResult;
  useDataRequestDelete: () => PluginMutationResult<{ id: string }, void>;
  // Absolute URL of a dataset's metadata page. Provided by the host because the
  // origin comes from its runtime configuration, which a remote plugin cannot read.
  metadataUrl: (datasetId: string) => string;
}
