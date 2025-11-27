import { useId, useState } from 'react';
import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl, type StyleSpecification, type ImmutableLike, Popup } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '../styles/SoilhiveMap.scss';
import Flower from '../assets/images/flower.svg?react';

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
  const [selectedPoint, setSelectedPoint] = useState(null);

  return (
    <div className="soilhive-map">
      <Map
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        className="map"
        mapStyle={currentMapStyle}
        {...(initialViewBoundingBox ? {initialViewState: { bounds: initialViewBoundingBox }} : {})}
        onClick={(event) => {
          setSelectedPoint(event.lngLat);
        }}
      >
        { selectedPoint &&
          <Popup
            anchor="left"
            longitude={selectedPoint.lng}
            latitude={selectedPoint.lat}
            offset={{
              left: 0,
              top: 0,
              "top-left": 0,
              bottom: 0
            }}
            onClose={() => {
              setSelectedPoint(null);
            }}
          >
            <div className="soilhive-map-popup-header">
              <div className="soilhive-map-popup-header-left" style={{minWidth: '24px'}}>
                <Flower />
              </div>
              <div className="soilhive-map-popup-header-right">
                <div className="soilhive-map-popup-header-right-title">
                  SOIL DATA
                </div>
                <div className="soilhive-map-popup-header-right-subtitle">
                  H3 Cell ID: 8a390cc4189ffff
                </div>
              </div>
            </div>
            <div className="soilhive-map-popup-content">
              <strong>Coordinates</strong><br />
              Longitude {selectedPoint.lng}<br />
              Latitude {selectedPoint.lat}
            </div>
          </Popup>
        }
        {showGeocoder && <GeocoderControl position="top-left" geocoder={geocoder} />}
        { showGeolocation && <GeolocateControl position="bottom-right" /> }
        { showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} /> }
        { showScale && <ScaleControl /> }
      </Map>
      { mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} /> }
    </div>
  );
};

export default SoilhiveMap;