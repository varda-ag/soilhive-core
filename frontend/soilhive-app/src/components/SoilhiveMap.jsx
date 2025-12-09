import { useEffect, useId, useRef, useState } from 'react';
import { GeolocateControl, Map, NavigationControl, ScaleControl, TerrainControl,type MapGeoJSONFeature, type StyleSpecification, type ImmutableLike, type LayerProps, Popup, Source, Layer, useMap } from 'react-map-gl/maplibre';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css'
import '../styles/SoilhiveMap.scss';
import Flower from '../assets/images/flower.svg?react';
import { polygonToCells } from 'h3-js';
import { bboxToGeoJSONPolygonCoordinates, bBoxToH3Cells, h3IndexesToGeoJSONPolygons } from '../utilities/geo';
import { bboxPolygon } from '@turf/turf';
import { h3ResolutionForZoomLevel } from '../utilities/map';
import DrawControl from './DrawControl';

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
  showH3Cells?: boolean;
  mapStyles?: MapStyles;
  scrollZoom?: boolean;
  dragPan?: boolean;
};

const dataLayerFills: LayerProps = {
  id: 'data-fills',
  type: 'fill',
  paint: {
    'fill-color': '#F5B200',
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      0.5,
      0
    ]
  }
};

const dataLayerBorders: LayerProps = {
  id: 'data-borders',
  type: 'line',
  paint: {
    "line-color": 'black',
    "line-width": 0.1,
    "line-opacity": 0.5
  }
};

function SoilhiveMap({
  initialViewBoundingBox,
  showGeocoder = false,
  geocoder = 'nominatim',
  showNavigation = true,
  showGeolocation = true,
  showScale = true,
  showH3Cells = false,
  mapStyles = [{name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'}],
  scrollZoom = true,
  dragPan = true
}: SoilhiveMapProps) {
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles[0].mapStyle);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const selectedFeatureRef = useRef<MapGeoJSONFeature>();
  const [h3Cells, setH3Cells] = useState(null);

  function updateH3Cells(mapEvent) {
    if(!showH3Cells) {
      setH3Cells(null);
      return;
    };
    try {
      const map = mapEvent.target;
      const zoomLevel = map.getZoom()
      const bounds = map.getBounds().toArray().flat();
      const h3Indexes = bBoxToH3Cells(bounds, h3ResolutionForZoomLevel(zoomLevel));
      const h3CellsFeatureCollection = h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }

  return (
    <div className="soilhive-map">
      <Map
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        className="map"
        mapStyle={currentMapStyle}
        {...(initialViewBoundingBox ? {initialViewState: { bounds: initialViewBoundingBox }} : {})}
        onDragEnd={updateH3Cells}
        onLoad={updateH3Cells}
        onZoomEnd={updateH3Cells}
        onMoveEnd={updateH3Cells}        
        onClick={(event) => {
          const map = event.target;
          if(event.features?.length > 0) {
            const selectedFeature = event.features[0];
            if(selectedFeature.id !== selectedFeatureRef.current?.id) {
              map.setFeatureState(
                { source: 'data', id: selectedFeature.id },
                { selected: true }
              );
              if(selectedFeatureRef.current) {
                map.setFeatureState(
                  { source: 'data', id: selectedFeatureRef.current.id },
                  { selected: false }
                );
              }
              selectedFeatureRef.current = selectedFeature;
            }
          } else {
            if(selectedFeatureRef.current) {
              map.setFeatureState(
                { source: 'data', id: selectedFeatureRef.current.id },
                { selected: false }
              );
            }
            selectedFeatureRef.current = null;
          }
          // setSelectedPoint(event.lngLat);
        }}
        interactiveLayerIds={['data-fills']}
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

        { showH3Cells && h3Cells &&
          <Source id="data" type="geojson" data={h3Cells} promoteId='h3Index'>
            <Layer {...dataLayerFills} />
            <Layer {...dataLayerBorders} />
          </Source>
        }

        {showGeocoder && <GeocoderControl position="top-left" geocoder={geocoder} />}
              
        { showGeolocation && <GeolocateControl position="bottom-right" /> }
        { showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} /> }
        <DrawControl
          position="bottom-right"
          // displayControlsDefault={false}
          // controls={{
          //   polygon: true,
          //   trash: true
          // }}
          // defaultMode="draw_polygon"
          // onCreate={onUpdate}
          // onUpdate={onUpdate}
          // onDelete={onDelete}
        />  

        { showScale && <ScaleControl /> }
      </Map>
      { mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} /> }
    </div>
  );
};

export default SoilhiveMap;