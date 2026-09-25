import { useMemo } from 'react';
import type {
  PluginDataFilterInput,
  PluginDataset,
  PluginDataRequestData,
  PluginDataRequestResult,
  PluginDataRequestSubmission,
  PluginFilteredData,
  PluginGeometry,
  PluginQueryResult,
  PluginRasterFilterCategory,
  PluginSoilDataParameters,
  PluginSoilDataResult,
  PluginSoilProperty,
  PluginSoilPropertyCategory,
  PluginTheme,
} from 'frontend-plugin-types';
import type { DataFilterDTO, GISDataType } from 'types/backend';
import type { PluginContext } from 'types/plugins';
import { useAuthContext } from '../auth/AuthContextProvider';
import useAvailabilityData from './useAvailabilityData';
import useAvailabilityMap from './useAvailabilityMap';
import { useDataFilterQuery as useHostDataFilterQuery } from './useDataFilterQuery';
import { useFilteredCoverageQuery as useHostFilteredCoverageQuery } from './useFilteredCoverageQuery';
import { useSoilData as useHostSoilData } from './useSoilData';
import useHostTheme from './useTheme';
import usePluginConfig from './usePluginConfig';
import usePluginConfigs from './usePluginConfigs';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from './usePluginConfigEntitlements';
import { usePluginUserEntitlements } from './usePluginUserEntitlements';
import { metadataUrl } from 'configuration/routes';

function usePluginTheme(): PluginQueryResult<PluginTheme> {
  const { themeConfig, logo, isLoadingThemeConfig, isLogoLoading } = useHostTheme();
  return {
    data: { colors: themeConfig.colors, logoUrl: logo },
    isLoading: isLoadingThemeConfig || isLogoLoading,
    isError: false,
  };
}

function usePluginDataFilterQuery(filters: PluginDataFilterInput, enabled?: boolean, debounceTime?: number): PluginQueryResult<string> {
  const { filterId, isLoading } = useHostDataFilterQuery(
    {
      geometries: filters.geometries as DataFilterDTO['geometries'],
      parameters: {
        ...filters.parameters,
        data_types: filters.parameters.data_types as GISDataType[] | undefined,
      },
    },
    enabled,
    debounceTime,
  );

  return { data: filterId, isLoading, isError: false };
}

function usePluginFilteredCoverageQuery(filterId: string | undefined, geometryOnly?: boolean): PluginQueryResult<PluginFilteredData> {
  const { data, isLoading } = useHostFilteredCoverageQuery(filterId, geometryOnly);
  return { data: data as PluginFilteredData | undefined, isLoading, isError: false };
}

function usePluginSoilProperties(): PluginQueryResult<PluginSoilProperty[]> {
  const { soilProperties, isLoadingSoilProperties } = useAvailabilityData();
  return { data: soilProperties, isLoading: isLoadingSoilProperties, isError: false };
}

function usePluginPropertiesCategories(): PluginQueryResult<PluginSoilPropertyCategory[]> {
  const { categories, isLoadingCategories } = useAvailabilityData();
  return { data: categories, isLoading: isLoadingCategories, isError: false };
}

function usePluginRasterCategories(): PluginQueryResult<PluginRasterFilterCategory[]> {
  const { rasterCategories, isLoadingRasterCategories } = useAvailabilityData();
  return { data: rasterCategories, isLoading: isLoadingRasterCategories, isError: false };
}

function usePluginVisibleDatasets(): PluginQueryResult<PluginDataset[]> {
  const { visibleDatasets, isLoadingVisibleDatasets } = useAvailabilityData();
  return { data: visibleDatasets, isLoading: isLoadingVisibleDatasets, isError: false };
}

function usePluginSoilData(parameters: PluginSoilDataParameters): PluginSoilDataResult {
  const { allData, isLoading, hasMore, loadMore, reset } = useHostSoilData(parameters);
  return { data: allData, isLoading, hasMore, loadMore, reset };
}

// Stub: replaces this with the real declarative useDataRequest hook.
function usePluginDataRequest<S extends PluginDataRequestSubmission>(
  _submission: S | undefined,
): PluginDataRequestResult<PluginDataRequestData<S>> {
  return { status: 'idle', data: undefined, isStale: false, error: undefined, retry: () => {}, isLoading: false, isError: false };
}

export function usePluginContext(): PluginContext {
  const { user } = useAuthContext();
  const { selectedPoint, selectedH3Cell, selection, boundingBox, geometryFilter, selectionType, locationName } = useAvailabilityMap();

  return useMemo<PluginContext>(
    () => ({
      // Narrow explicitly rather than passing `user` through as-is: it
      // carries access_token/refresh_token/id_token, which PluginContext's
      // thin contract must not leak to plugins.
      user: user ? { profile: { name: user.profile?.name, email: user.profile?.email } } : user,
      useTheme: usePluginTheme,
      useDataFilterQuery: usePluginDataFilterQuery,
      useFilteredCoverageQuery: usePluginFilteredCoverageQuery,
      useSoilProperties: usePluginSoilProperties,
      usePropertiesCategories: usePluginPropertiesCategories,
      useRasterCategories: usePluginRasterCategories,
      useVisibleDatasets: usePluginVisibleDatasets,
      useSoilData: usePluginSoilData,
      // Already matches PluginContext's signature (pluginId, id, defaultConfig),
      // so it's passed through directly rather than wrapped like the hooks above.
      usePluginConfig,
      usePluginConfigs,
      // Already matches PluginContext's signature (pluginId, configId), so passed
      // through directly, same as usePluginConfig/usePluginConfigs above.
      usePluginConfigEntitlements,
      usePluginConfigEntitlementsMutation,
      usePluginUserEntitlements,
      useDataRequest: usePluginDataRequest,
      // A plain function, not a hook: plugins call it while rendering a dataset
      // row, so it must not add a hook to their render order.
      metadataUrl,
      // Narrow explicitly too: selectedPoint/selectedH3Cell are maplibre-gl
      // classes, not plain data, which PluginContext's thin contract must not depend on.
      mapSelection: {
        selectedPoint: selectedPoint ? { lng: selectedPoint.lng, lat: selectedPoint.lat } : null,
        selectedH3Cell: selectedH3Cell
          ? { type: 'Feature' as const, geometry: selectedH3Cell.geometry, properties: selectedH3Cell.properties }
          : null,
        selection: {
          type: selection.type,
          features: selection.features.map(feature => ({
            type: 'Feature' as const,
            geometry: (feature as GeoJSON.Feature).geometry,
            properties: (feature as GeoJSON.Feature).properties,
          })),
        },
        boundingBox,
        geometryFilter: geometryFilter as PluginGeometry[],
        selectionType,
        locationName,
      },
    }),
    [user, selectedPoint, selectedH3Cell, selection, boundingBox, geometryFilter, selectionType, locationName],
  );
}
