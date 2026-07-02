import type { StyleSpecification } from 'react-map-gl/maplibre';

export const h3ResolutionForZoomLevel = (zoomLevel: number): number => {
  const map = [1, 1, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8, 9, 9, 10, 10, 11, 12, 12, 13, 13];
  return map[Math.trunc(zoomLevel)] ?? 14;
};

export const EOX_SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'eox-sentinel': {
      type: 'raster',
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'],
      tileSize: 256,
      attribution: 'Sentinel-2 cloudless 2024 © EOX',
    },
    'eox-overlay': {
      type: 'raster',
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/overlay_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.png'],
      tileSize: 256,
      attribution: 'Overlay © OpenStreetMap',
    },
  },
  layers: [
    { id: 'sentinel-bg', type: 'raster', source: 'eox-sentinel' },
    { id: 'labels-overlay', type: 'raster', source: 'eox-overlay' },
  ],
};

export const getMapStyles = () => {
  const open = [
    { name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
    { name: 'Sentinel-2 cloudless 2024 © EOX', mapStyle: EOX_SATELLITE_MAP_STYLE },
    { name: 'Maplibre Demotile Globe', mapStyle: 'https://demotiles.maplibre.org/globe.json' },
    { name: 'OpenMap Tiles OSM Bright', mapStyle: 'https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json' },
  ];
  return open;
};

export const customAttribution =
  '<a href="https://www.varda.ag" target="_blank">Varda Foundation</a>’s <a href="https://github.com/varda-ag/soilhive-core" target="_blank">open source</a> infrastructure';
