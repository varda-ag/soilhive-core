import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoidmFyZGEtbWFwYm94LWFkbWluIiwiYSI6ImNsZmttZTQweTA5ZTg0M3MwMGlpanplZmsifQ.Tg6f5VFvnSPjGrwV_g6nVg';

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap Contributors',
      maxzoom: 19
    },
    terrainSource: {
      type: 'raster-dem',
      // url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
      url: 'https://api.mapbox.com/v4/{tileset_id}/{zoom}/{x}/{y}.png?access_token='+MAPBOX_ACCESS_TOKEN,
      tileSize: 256
    }
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm'
    }
  ],
  terrain: {
    source: 'terrainSource',
    exaggeration: 1
  },
  sky: {}
};


function SoilhiveMap({initialViewBoundingBox, showGeocoder = false}: {initialViewBoundingBox?: [number, number, number, number], showGeocoder?: boolean}) {
  return (
    <Map
      {...(initialViewBoundingBox ? { initialViewState: { bounds: initialViewBoundingBox } } : {})}
      // initialViewState={{
      //   bounds: [32.95418, 3.42206, 47.78942, 14.95943]
      //   // longitude: -100,
      //   // latitude: 40,
      //   // zoom: 3.5,
      // }} 
      style={{width: "100%"}}
      // mapStyle="mapbox://styles/mapbox/standard"
      // mapStyle="mapbox://styles/mapbox/standard-satellite"
      // mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
      // mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      mapStyle={MAP_STYLE}
    >
      { showGeocoder && <GeocoderControl position="top-left" onLoading={() => {}} onResults={() => {}} onResult={() => {}} onError={() => {}} /> }
      <GeolocateControl position="bottom-right" />
      <NavigationControl position="bottom-right"  showCompass={false} showZoom={true} visualizePitch={true} />
      <ScaleControl />
      <TerrainControl />
    </Map>
  );
};

export default SoilhiveMap;