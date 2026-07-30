import { useMemo } from 'react';
import type { PluginDataset, PluginGeometry, PluginQueryResult } from 'frontend-plugin-types';
import type { PluginContext } from 'types/plugins';
import { useAuthContext } from '../auth/AuthContextProvider';
import useAvailabilityMap from './useAvailabilityMap';
import { useDatasets } from './useDatasets';

function usePluginDatasets(): PluginQueryResult<PluginDataset[]> {
  const { datasets, isLoading, isError } = useDatasets();
  return {
    data: datasets?.map(({ id, slug, name, description }) => ({ id, slug, name, description })),
    isLoading,
    isError,
  };
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
      useDatasets: usePluginDatasets,
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
        geometryFilter: geometryFilter as unknown as PluginGeometry[],
        selectionType,
        locationName,
      },
    }),
    [user, selectedPoint, selectedH3Cell, selection, boundingBox, geometryFilter, selectionType, locationName],
  );
}
