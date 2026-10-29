import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { MultiPolygon, Polygon } from 'geojson';
import type { MapSelection } from '../contexts/AvailabilityMapContext';
import type { MapInfoCardPlugin, PluginContext } from '../types/plugins';
import { resolveOwnPagePath } from '../utilities/ownPagePath';
import { useDataFilterQuery } from './useDataFilterQuery';
import { usePluginContext } from './usePluginContext';
import useRemotes from './useRemotes';

export interface MapInfoCard {
  key: string;
  Page: MapInfoCardPlugin['Page'];
  context: PluginContext;
}

const selectionGeometries = (selection: MapSelection): (Polygon | MultiPolygon)[] =>
  selection.features.flatMap(feature => {
    const { geometry } = feature as GeoJSON.Feature;
    return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon' ? [geometry] : [];
  });

// The plugin cards of the map's area info card, each with its own context for the selection.
export function useMapInfoCardsHook(selection: MapSelection): { cards: MapInfoCard[] } {
  const { mapInfoCards } = useRemotes();
  const pluginContext = usePluginContext();
  const navigate = useNavigate();

  const filter = useMemo(() => ({ geometries: selectionGeometries(selection), parameters: {} }), [selection]);
  const { filterId } = useDataFilterQuery(filter, mapInfoCards.length > 0 && filter.geometries.length > 0);

  const cards = useMemo(
    () =>
      mapInfoCards.map(({ card, route }) => ({
        key: card.pluginId,
        Page: card.Page,
        context: {
          ...pluginContext,
          mapSelectionFilterId: filterId,
          navigateToOwnPage: (subPath?: string) => {
            const path = resolveOwnPagePath(route, subPath);
            if (path) {
              navigate(path);
            } else {
              console.warn(`Plugin ${card.pluginId} cannot open "${subPath}": it is outside /${route}`);
            }
          },
        },
      })),
    [mapInfoCards, pluginContext, filterId, navigate],
  );

  return { cards };
}
