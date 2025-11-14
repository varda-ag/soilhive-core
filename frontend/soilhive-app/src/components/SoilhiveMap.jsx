import { useId, useState } from 'react';
import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl, type StyleSpecification, type ImmutableLike } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '../styles/SoilhiveMap.scss';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;
type MapStyles = Array<{ name: string, mapStyle: MapStyle }>;

function MapStyleSwitcher({mapStyles, onMapStyleChange}: {
  mapStyles: MapStyles;
  onMapStyleChange: Dispatch<MapStyle>;
}) {
  const id = useId();
  return (
    <div className="map-style-switcher">
      {/* <label for={id}>Map style</label>  */}
      <select name="map-styles"
        id={id} 
        defaultValue={0}
        onChange={
          event => {
            const selectedIndex = Number(event.target.value);
            onMapStyleChange(mapStyles[selectedIndex].mapStyle);
          } 
        }
      >
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
  geocoder?: 'nominatim' | 'mapbox';
  showNavigation?: boolean;
  showGeolocation?: boolean;
  showScale?: boolean;
  mapStyles?: MapStyles;
  scrollZoom?: boolean;
  dragPan?: boolean;
};

function SoilhiveMap({
  initialViewBoundingBox,
  showGeocoder = false,
  geocoder = 'nominatim',
  showNavigation = true,
  showGeolocation = true,
  showScale = true,
  mapStyles = [{name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'}],
  scrollZoom = true,
  dragPan = true
}: SoilhiveMapProps) {
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles[0].mapStyle);
  return (
    <div className="soilhive-map">
      <Map
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        className="map"
        mapStyle={currentMapStyle}
        {...(initialViewBoundingBox ? {initialViewState: { bounds: initialViewBoundingBox }} : {})}
      >
        {showGeocoder && <GeocoderControl position="top-left" geocoder={geocoder} onLoading={() => { }} onResults={() => { }} onResult={() => { }} onError={() => { }} />}
        { showGeolocation && <GeolocateControl position="bottom-right" /> }
        { showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} /> }
        { showScale && <ScaleControl /> }
      </Map>
      { mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} /> }
    </div>
  );
};

export default SoilhiveMap;