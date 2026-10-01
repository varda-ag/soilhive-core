import { useCallback, useMemo, useRef } from 'react';
import type {
  PluginDataFilterInput,
  PluginFilterCriteria,
  PluginFilteredData,
  PluginGeometry,
  PluginNotification,
  PluginNotificationsResult,
  PluginQueryResult,
  PluginRasterFilterCategory,
  PluginSoilDataParameters,
  PluginSoilDataResult,
  PluginSoilProperty,
  PluginSoilPropertyCategory,
  PluginStoredDataFilter,
  PluginTheme,
} from 'frontend-plugin-types';
import type { DataFilterDTO, GISDataType } from 'types/backend';
import type { PluginContext } from 'types/plugins';
import { useAuthContext } from '../auth/AuthContextProvider';
import { useDataFilterQuery as useHostDataFilterQuery } from './useDataFilterQuery';
import { useFilter as useHostFilter } from './useFilter';
import { useFilteredCoverageQuery as useHostFilteredCoverageQuery } from './useFilteredCoverageQuery';
import useHostNotifications from './useNotifications';
import { usePropertiesCategories as useHostPropertiesCategories } from './usePropertiesCategories';
import { useRaster as useHostRaster } from './useRaster';
import { useSoilData as useHostSoilData } from './useSoilData';
import { useSoilProperties as useHostSoilProperties } from './useSoilProperties';
import useHostTheme from './useTheme';
import usePluginConfig from './usePluginConfig';
import usePluginConfigs from './usePluginConfigs';
import usePluginConfigDelete from './usePluginConfigDelete';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from './usePluginConfigEntitlements';
import { usePluginUserEntitlements } from './usePluginUserEntitlements';
import { usePluginDataRequest, usePluginDataRequestDelete, usePluginDataRequestSubmit } from './usePluginDataRequest';
import { metadataUrl } from 'configuration/routes';

function usePluginTheme(): PluginQueryResult<PluginTheme> {
  const { themeConfig, logo, isLoadingThemeConfig, isLogoLoading, isThemeConfigError, isLogoError } = useHostTheme();
  // A missing logo (404) isn't an error — the host resolves it to a null logoUrl.
  return {
    data: { colors: themeConfig.colors, logoUrl: logo },
    isLoading: isLoadingThemeConfig || isLogoLoading,
    isError: isThemeConfigError || isLogoError,
  };
}

function usePluginDataFilterQuery(filters: PluginDataFilterInput, enabled?: boolean, debounceTime?: number): PluginQueryResult<string> {
  const { filterId, isLoading, isError } = useHostDataFilterQuery(
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

  return { data: filterId, isLoading, isError };
}

function usePluginFilteredCoverageQuery(filterId: string | undefined, geometryOnly?: boolean): PluginQueryResult<PluginFilteredData> {
  const { data, isLoading, isError } = useHostFilteredCoverageQuery(filterId, geometryOnly);
  return { data: data as PluginFilteredData | undefined, isLoading, isError };
}

// Narrow explicitly rather than passing the stored filter through as-is: it
// carries the owner, which PluginContext's thin contract must not leak to plugins.
function usePluginFilter(filterId: string | undefined): PluginQueryResult<PluginStoredDataFilter> {
  const { filter, isLoading, isError } = useHostFilter(filterId);
  const data = filter
    ? {
        id: filter.id,
        name: filter.name,
        filter: {
          geometries: filter.filter.geometries as PluginGeometry[],
          parameters: filter.filter.parameters as PluginFilterCriteria,
        },
      }
    : undefined;
  return { data, isLoading, isError };
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
  const { allCategories, isLoading, isError } = useHostRaster();
  return { data: allCategories, isLoading, isError };
}

function usePluginSoilData(parameters: PluginSoilDataParameters): PluginSoilDataResult {
  const { allData, isLoading, hasMore, loadMore, reset } = useHostSoilData(parameters);
  return { data: allData, isLoading, hasMore, loadMore, reset };
}

let autoNotificationId = 0;

// Only showNotification is exposed: the host's visible list and removeNotification stay private.
// A counter, not crypto.randomUUID, since that needs a secure context and hosts may serve plain HTTP.
function usePluginNotifications(pluginId: string): PluginNotificationsResult {
  const { showNotification: hostShow } = useHostNotifications();
  // The host's showNotification changes identity whenever a toast starts closing; read it
  // through a ref so plugins get a stable callback for their effect deps.
  const hostShowRef = useRef(hostShow);
  hostShowRef.current = hostShow;
  const showNotification = useCallback(
    ({ id, ...notification }: PluginNotification) => {
      hostShowRef.current({ id: `plugin:${pluginId}:${id ?? `auto-${++autoNotificationId}`}`, ...notification });
    },
    [pluginId],
  );
  return useMemo(() => ({ showNotification }), [showNotification]);
}

export function usePluginContext(): PluginContext {
  const { user } = useAuthContext();

  return useMemo<PluginContext>(
    () => ({
      // Narrow explicitly rather than passing `user` through as-is: it
      // carries access_token/refresh_token/id_token, which PluginContext's
      // thin contract must not leak to plugins.
      user: user ? { profile: { name: user.profile?.name, email: user.profile?.email } } : user,
      useTheme: usePluginTheme,
      useDataFilterQuery: usePluginDataFilterQuery,
      useFilteredCoverageQuery: usePluginFilteredCoverageQuery,
      useFilter: usePluginFilter,
      useSoilProperties: usePluginSoilProperties,
      usePropertiesCategories: usePluginPropertiesCategories,
      useRasterCategories: usePluginRasterCategories,
      useSoilData: usePluginSoilData,
      // Already matches PluginContext's signature (pluginId, id, defaultConfig),
      // so it's passed through directly rather than wrapped like the hooks above.
      usePluginConfig,
      usePluginConfigs,
      usePluginConfigDelete,
      // Already matches PluginContext's signature (pluginId, configId), so passed
      // through directly, same as usePluginConfig/usePluginConfigs above.
      usePluginConfigEntitlements,
      usePluginConfigEntitlementsMutation,
      usePluginUserEntitlements,
      useDataRequestSubmit: usePluginDataRequestSubmit,
      useDataRequest: usePluginDataRequest,
      useDataRequestDelete: usePluginDataRequestDelete,
      // A plain function, not a hook: plugins call it while rendering a dataset
      // row, so it must not add a hook to their render order.
      metadataUrl,
      useNotifications: usePluginNotifications,
    }),
    [user],
  );
}
