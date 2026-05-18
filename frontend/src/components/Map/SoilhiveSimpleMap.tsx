import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Map,
  NavigationControl,
  type StyleSpecification,
  type ImmutableLike,
  type LayerProps,
  Source,
  Layer,
  Marker,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../styles/SoilhiveMap.scss';
import { bBoxToH3Cells, h3IndexesToGeoJSONPolygons, largestPolygon as largestPolygonFn } from '../../utilities/geo';
import { bbox as bboxFn } from '@turf/turf';
import { EOX_SATELLITE_MAP_STYLE, h3ResolutionForZoomLevel } from '../../utilities/map';
import { simplifyGeometry } from '../../utilities/simplifyGeometry';
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import type { MapLibreEvent } from 'maplibre-gl';
import GeocoderControl from './GeocoderControl';
import MarkerPinIcon from 'assets/icons/marker-pin-icon.svg?react';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;

interface SoilhiveSimpleMapProps {
  initialViewBoundingBox?: [number, number, number, number];
  geometryFeature?: FeatureCollection;
  selectedFeature?: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties>;
  showH3Cells?: boolean;
  showNavigation?: boolean;
  mapStyle?: MapStyle;
  scrollZoom?: boolean;
  dragPan?: boolean;
  showGeocoder?: boolean;
  onBboxChange?: (bbox: number[]) => void;
}

const geometryLayerSelection: LayerProps = {
  id: 'geometry',
  type: 'fill',
  paint: {
    'fill-color': '#F5B200',
    'fill-opacity': 0.5,
  },
};

const h3CellsLayerBorders: LayerProps = {
  id: 'h3-cells-borders',
  type: 'line',
  paint: {
    'line-color': 'black',
    'line-width': 0.1,
    'line-opacity': 0.5,
  },
};

const selectionLayer: LayerProps = {
  id: 'selection',
  type: 'line',
  paint: {
    'line-color': 'red',
    'line-width': 1,
    'line-opacity': 1,
  },
};

function MapSelection({ feature }: { feature: Feature<Point | Polygon | MultiPolygon, GeoJsonProperties> }) {
  const [animating, setAnimating] = useState(false);

  const coordKey = feature.geometry.type === 'Point' ? feature.geometry.coordinates.join(',') : null;

  useEffect(() => {
    if (!coordKey) return;
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 700);
    return () => clearTimeout(timer);
  }, [coordKey]);

  if (feature.geometry.type === 'Point') {
    const [lon, lat] = feature.geometry.coordinates;
    return (
      <Marker longitude={lon} latitude={lat}>
        <div className="marker-container">
          <div className={`marker-pin${animating ? ' marker-bounce' : ''}`}>
            <MarkerPinIcon />
          </div>
          <svg className="marker-shadow" display="block" height="46px" width="27px" viewBox="0 0 27 46">
            <circle cx="13.5" cy="40" r="2.5" fill="#3FB1CE" />
          </svg>
        </div>
      </Marker>
    );
  }
  return (
    <Source id="selection" type="geojson" data={feature}>
      <Layer {...selectionLayer} />
    </Source>
  );
}

function calculateBoundingBox(geometryFeature?: FeatureCollection) {
  const firstGeometry = geometryFeature?.features?.[0]?.geometry;
  if (!firstGeometry) return undefined;
  const simplifiedGeometry: Polygon | MultiPolygon = simplifyGeometry(firstGeometry as Polygon | MultiPolygon);
  const largestPolygon = simplifiedGeometry.type === 'MultiPolygon' ? largestPolygonFn(simplifiedGeometry) : simplifiedGeometry;
  if (largestPolygon === null) throw new Error('A valid MultiPolygon should contain at least a Polygon');
  const bbox = bboxFn(largestPolygon!) as [number, number, number, number];
  return bbox;
}

function SoilhiveSimpleMap({
  initialViewBoundingBox,
  selectedFeature = undefined,
  geometryFeature = undefined,
  showNavigation = true,
  showH3Cells = false,
  mapStyle = EOX_SATELLITE_MAP_STYLE,
  scrollZoom = true,
  dragPan = true,
  showGeocoder = false,
  onBboxChange = undefined,
}: SoilhiveSimpleMapProps) {
  const mapRef = useRef<any>(null);
  const [h3Cells, setH3Cells] = useState<any | null>(null);

  function updateH3Cells(mapEvent: MapLibreEvent) {
    const map = mapEvent.target;
    const bounds = map.getBounds().toArray().flat();
    if (onBboxChange) {
      onBboxChange(bounds);
    }

    if (!showH3Cells) {
      setH3Cells(null);
      return;
    }

    try {
      const zoomLevel = map.getZoom();
      const h3Indexes = bBoxToH3Cells(bounds, h3ResolutionForZoomLevel(zoomLevel));
      const h3CellsFeatureCollection = h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }

  const fitBoundsToGeometryFeature = useCallback(() => {
    const bbox = calculateBoundingBox(geometryFeature);
    if (!bbox) return;
    mapRef.current?.fitBounds(bbox, { padding: 40, animate: false });
  }, [geometryFeature]);

  useEffect(() => {
    if (selectedFeature) {
      if (selectedFeature.geometry.type === 'Point') {
        mapRef.current?.flyTo({ center: selectedFeature.geometry.coordinates });
      } else {
        const bbox = bboxFn(selectedFeature);
        mapRef.current?.fitBounds(bbox, { padding: 40 });
      }
    } else {
      fitBoundsToGeometryFeature();
    }
  }, [fitBoundsToGeometryFeature, geometryFeature, selectedFeature]);

  function onMapLoad(mapEvent: MapLibreEvent) {
    updateH3Cells(mapEvent);
    fitBoundsToGeometryFeature();
  }

  return (
    <div className="soilhive-map">
      <Map
        ref={mapRef}
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        minZoom={3}
        maxZoom={24}
        renderWorldCopies={false}
        dragRotate={false}
        mapStyle={mapStyle}
        {...(initialViewBoundingBox ? { initialViewState: { bounds: initialViewBoundingBox } } : {})}
        onDragEnd={updateH3Cells}
        onLoad={onMapLoad}
        onZoomEnd={updateH3Cells}
        onMoveEnd={updateH3Cells}
        attributionControl={{ compact: false }}
      >
        {showGeocoder && <GeocoderControl position="top-left" geocoder="nominatim" />}

        {showH3Cells && h3Cells && (
          <Source id="h3-cells" type="geojson" data={h3Cells} promoteId="h3Index">
            <Layer {...h3CellsLayerBorders} />
          </Source>
        )}
        {geometryFeature && (
          <Source id="geometry" type="geojson" data={geometryFeature}>
            <Layer {...geometryLayerSelection} />
          </Source>
        )}
        {selectedFeature && <MapSelection feature={selectedFeature} />}
        {showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} />}
      </Map>
    </div>
  );
}

export default SoilhiveSimpleMap;
