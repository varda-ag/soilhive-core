import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl, type StyleSpecification } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';

function MapStyleSwitcher() {
  return (
    <div>MapStyleSwitcher skeleton</div>
  );
}

interface SoilhiveMapProps {
  initialViewBoundingBox?: [number, number, number, number],
  showGeocoder?: boolean,
  mapStyles?: Array<{ name: string, mapStyle: StyleSpecification }>
};

function SoilhiveMap({
  initialViewBoundingBox,
  showGeocoder = false,
  mapStyles = [{name: 'CartoCDN Basemaps: Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'}]
}: SoilhiveMapProps) {
  return (
    <div className="soilhive-map" style={{ width: '100%', height: "100%" }}>
      <Map
        style={{ width: "100%" }}
        mapStyle={mapStyles[0].mapStyle}
      // mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      // mapStyle="https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json"
      // mapStyle="https://demotiles.maplibre.org/globe.json"
      // mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      >
        {showGeocoder && <GeocoderControl position="top-left" onLoading={() => { }} onResults={() => { }} onResult={() => { }} onError={() => { }} />}
        <GeolocateControl position="bottom-right" />
        <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} />
        <ScaleControl />
      </Map>
      <MapStyleSwitcher />
    </div>
  );
};

export default SoilhiveMap;