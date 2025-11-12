import { useId } from 'react';
import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl, type StyleSpecification, type ImmutableLike } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '../styles/SoilhiveMap.css';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;
type MapStyles = Array<{ name: string, mapStyle: MapStyle }>;

function MapStyleSwitcher({mapStyles}: {mapStyles: MapStyles}) {
  const id = useId();
  return (
    <div className="map-style-switcher">
      {/* <label for={id}>Map style</label>  */}
      <select name="map-styles" id={id}>
        { mapStyles.map(({name}, index) => {
            return (<option key={index} value={index}>{name}</option>)
          })
        }
      </select>
    </div>
  );
}

interface SoilhiveMapProps {
  initialViewBoundingBox?: [number, number, number, number];
  showGeocoder?: boolean;
  mapStyles?: MapStyles;
};

function SoilhiveMap({
  initialViewBoundingBox,
  showGeocoder = false,
  mapStyles = [{name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'}]
}: SoilhiveMapProps) {
  return (
    <div className="soilhive-map">
      <Map
        className="map"
        mapStyle={mapStyles[0].mapStyle}
        // mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        // mapStyle="https://openmaptiles.geo.data.gouv.fr/styles/osm-bright/style.json"
        // mapStyle="https://demotiles.maplibre.org/globe.json"
        // mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        {...(initialViewBoundingBox ? {initialViewState: { bounds: initialViewBoundingBox }} : {})}
      >
        {showGeocoder && <GeocoderControl position="top-left" onLoading={() => { }} onResults={() => { }} onResult={() => { }} onError={() => { }} />}
        <GeolocateControl position="bottom-right" />
        <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} />
        <ScaleControl />
      </Map>
      { mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} /> }
    </div>
  );
};

export default SoilhiveMap;