import type { StyleSpecification } from 'react-map-gl/maplibre';
import { MAPBOX_ACCESS_TOKEN } from '../utilities/environmentVariables';

/**
 * Switching from the official Mapbox GL JS library to MapLibre GL JS while still using Mapbox-hosted tiles
 * means moving from a "Map Load" billing model to a "Tile Request" billing model.
 * Mapbox GL JS (v2.0+):
 *   Billed per "Map Load". Mapbox charges every time the map is initialized (the new mapboxgl.Map(...) call).
 *   Once the map is loaded, the user can pan, zoom, and explore as much as they want for up to 12 hours without triggering additional costs.
 * MapLibre + Mapbox Tiles:
 *   Billed per "Tile Request". Because MapLibre is a third-party library, Mapbox cannot track "initializations" the same way.
 *   Instead, they charge for every individual Vector Tile or Raster Tile requested from their servers as the user moves the map.
 */

const MAPBOX_SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'raster-tiles': {
      type: 'raster',
      tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${MAPBOX_ACCESS_TOKEN}`],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'raster-tiles',
    },
  ],
};

export const getMapboxStyles = () => {
  if (!MAPBOX_ACCESS_TOKEN) {
    return [];
  }
  return [
    { name: 'Mapbox Streets', mapStyle: 'mapbox://styles/mapbox/satellite-streets-v11' },
    { name: 'Mapbox Satellite', mapStyle: MAPBOX_SATELLITE_MAP_STYLE },
  ];
};
