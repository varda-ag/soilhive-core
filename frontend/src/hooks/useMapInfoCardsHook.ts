import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { MultiPolygon, Polygon } from 'geojson';
import type { MapSelection } from '../contexts/AvailabilityMapContext';
import type { PluginContext, RemotePlugin, SinglePagePlugin } from '../types/plugins';
import { isSinglePageModule } from '../utilities/moduleFederation';
import { resolveOwnPagePath } from '../utilities/ownPagePath';
import { useDataFilterQuery } from './useDataFilterQuery';
import { usePluginContext } from './usePluginContext';
import useRemotes from './useRemotes';

export interface MapInfoCard {
  key: string;
  Page: NonNullable<RemotePlugin['MapInfoCard']>;
  context: PluginContext;
}

type CardPlugin = SinglePagePlugin & Required<Pick<RemotePlugin, 'MapInfoCard'>>;

// Only a routed page can host a card: its navigateToOwnPage needs the route
const hasMapInfoCard = (plugin: RemotePlugin): plugin is CardPlugin => isSinglePageModule(plugin) && !!plugin.MapInfoCard;

const selectionGeometries = (selection: MapSelection): (Polygon | MultiPolygon)[] =>
  selection.features.flatMap(feature => {
    const { geometry } = feature as GeoJSON.Feature;
    return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon' ? [geometry] : [];
  });

// The plugin cards of the map's area info card, each with its own context for the selection.
export function useMapInfoCardsHook(selection: MapSelection): { cards: MapInfoCard[] } {
  const { plugins } = useRemotes();
  const cardPlugins = useMemo(() => plugins.filter(hasMapInfoCard), [plugins]);
  const pluginContext = usePluginContext();
  const navigate = useNavigate();

  const filter = useMemo(() => ({ geometries: selectionGeometries(selection), parameters: {} }), [selection]);
  // isLoading covers the debounce too, during which filterId still belongs to the previous selection
  const { filterId, isLoading: isSavingFilter } = useDataFilterQuery(filter, cardPlugins.length > 0 && filter.geometries.length > 0);
  const mapSelectionFilterId = isSavingFilter ? undefined : filterId;

  const cards = useMemo(
    () =>
      cardPlugins.map(({ pluginId, route, MapInfoCard }) => ({
        key: pluginId,
        Page: MapInfoCard,
        context: {
          ...pluginContext,
          mapSelectionFilterId,
          navigateToOwnPage: (subPath?: string) => {
            const path = resolveOwnPagePath(route, subPath);
            if (path) {
              navigate(path);
            } else {
              console.warn(`Plugin ${pluginId} cannot open "${subPath}": it is outside /${route}`);
            }
          },
        },
      })),
    [cardPlugins, pluginContext, mapSelectionFilterId, navigate],
  );

  return { cards };
}
