import type {
  PluginConfigEntitlements,
  PluginConfigResult,
  PluginEntitlementScope,
  PluginMutationResult,
  PluginQueryResult,
  PluginUser,
} from './common';
import type { PluginDataRequest, PluginDataRequestResult, PluginDataRequestSubmission } from './dataRequest';
import type { PluginDataFilterInput, PluginFilteredData, PluginStoredDataFilter } from './filter';
import type { PluginNotificationsResult } from './notification';
import type {
  PluginRasterFilterCategory,
  PluginSoilDataParameters,
  PluginSoilDataResult,
  PluginSoilProperty,
  PluginSoilPropertyCategory,
} from './soil';
import type { PluginTheme } from './theme';
import type {
  PluginSoilIndexRun,
  PluginSoilIndexRunResult,
  PluginSoilIndexScore,
  PluginSoilIndexSubmission,
  PluginVectorTileSource,
} from './soilIndex';

export * from './common';
export * from './map';
export * from './theme';
export * from './filter';
export * from './soil';
export * from './dataRequest';
export * from './notification';
export * from './soilIndex';

export interface PluginContext {
  user?: PluginUser | null;
  useTheme: () => PluginQueryResult<PluginTheme>;
  useDataFilterQuery: (filters: PluginDataFilterInput, enabled?: boolean, debounceTime?: number) => PluginQueryResult<string>;
  useFilteredCoverageQuery: (filterId: string | undefined, geometryOnly?: boolean) => PluginQueryResult<PluginFilteredData>;
  useFilter: (filterId: string | undefined) => PluginQueryResult<PluginStoredDataFilter>;
  useSoilProperties: () => PluginQueryResult<PluginSoilProperty[]>;
  usePropertiesCategories: () => PluginQueryResult<PluginSoilPropertyCategory[]>;
  useRasterCategories: () => PluginQueryResult<PluginRasterFilterCategory[]>;
  useSoilData: (parameters: PluginSoilDataParameters) => PluginSoilDataResult;
  // pluginId is the plugin's own exported id (see plugin-development.md), passed
  // back in so the same config namespace is used no matter which plugin calls it.
  usePluginConfig: <T>(pluginId: string, id: string, defaultConfig?: T) => PluginConfigResult<T>;
  // Read-only batch counterpart to usePluginConfig: fetches multiple ids in one
  // request. Missing ids are simply absent from the returned map.
  usePluginConfigs: <T>(pluginId: string, ids: string[], polling?: number) => PluginQueryResult<Record<string, T>>;
  // Deletes a config item for everyone, with its entitlements and attached Data Requests; final.
  // Resolves once the item has left every listing, and also when there is nothing the caller may
  // delete (already gone, or no write: show the button only with write). Rejects on server or
  // network errors.
  usePluginConfigDelete: (pluginId: string) => PluginMutationResult<{ id: string }, void>;
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
  // Resolves when the id is already gone, so a delete is safe to repeat.
  useDataRequestDelete: () => PluginMutationResult<{ id: string }, void>;
  // Soil Index Runs mirror Data Requests: attached to one of the plugin's saved config items, read
  // with read on it, deleted with write (see ADR 0044). Attaching protects a Run from deletion, not
  // its scores and tiles, which anyone holding the id can see. Deleting also removes its tiles.
  useSoilIndexSubmit: (pluginId: string, configId: string) => PluginMutationResult<PluginSoilIndexSubmission, PluginSoilIndexRun>;
  // Polls until completed or failed; undefined id = do not fetch.
  useSoilIndex: (id: string | undefined) => PluginSoilIndexRunResult;
  // Resolves when the id is already gone, so a delete is safe to repeat.
  useSoilIndexDelete: () => PluginMutationResult<{ id: string }, void>;
  // The map tiles of a completed Soil Index Run, as a MapLibre vector source; undefined runId =
  // do not fetch. The Run id is the whole permission: anyone holding it can see the tiles.
  useSoilIndexTileSource: (runId: string | undefined) => PluginQueryResult<PluginVectorTileSource>;
  // One score of that Run, e.g. for a hover tooltip: pass the hovered feature's id, or undefined
  // when nothing is hovered. Debounced by the host, and fetched at most once per score.
  useSoilIndexScore: (runId: string | undefined, scoreId: number | undefined) => PluginQueryResult<PluginSoilIndexScore>;
  // Absolute URL of a dataset's metadata page. Provided by the host because the
  // origin comes from its runtime configuration, which a remote plugin cannot read.
  metadataUrl: (datasetId: string) => string;
  // Shows a toast in the host's stack. Ids are namespaced under plugin:{pluginId}:, so they
  // never collide with the host's or another plugin's.
  useNotifications: (pluginId: string) => PluginNotificationsResult;
}
