import { useMemo } from 'react';
import type {
  PluginDataFilterInput,
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
import useAvailabilityMap from './useAvailabilityMap';
import { useDataFilterQuery as useHostDataFilterQuery } from './useDataFilterQuery';
import { useFilteredCoverageQuery as useHostFilteredCoverageQuery } from './useFilteredCoverageQuery';
import { usePropertiesCategories as useHostPropertiesCategories } from './usePropertiesCategories';
import { useRaster as useHostRaster } from './useRaster';
import { useSoilData as useHostSoilData } from './useSoilData';
import { useSoilProperties as useHostSoilProperties } from './useSoilProperties';
import useHostTheme from './useTheme';
import usePluginConfig from './usePluginConfig';

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
  const { data, isLoading, isError } = useHostSoilProperties();
  return { data, isLoading, isError };
}

function usePluginPropertiesCategories(): PluginQueryResult<PluginSoilPropertyCategory[]> {
  const { data, isLoading, isError } = useHostPropertiesCategories();
  return { data, isLoading, isError };
}

function usePluginRasterCategories(): PluginQueryResult<PluginRasterFilterCategory[]> {
  const { allCategories, isLoading } = useHostRaster();
  return { data: allCategories, isLoading, isError: false };
}

function usePluginSoilData(parameters: PluginSoilDataParameters): PluginSoilDataResult {
  const { allData, isLoading, hasMore, loadMore, reset } = useHostSoilData(parameters);
  return { data: allData, isLoading, hasMore, loadMore, reset };
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
      useSoilData: usePluginSoilData,
      // Already matches PluginContext's signature (pluginId, id, defaultConfig),
      // so it's passed through directly rather than wrapped like the hooks above.
      usePluginConfig,
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
