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
import { h3ResolutionForZoomLevel } from '../../utilities/map';
import { simplifyGeometry } from '../../utilities/simplifyGeometry';
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Point, Polygon } from 'geojson';
import type { MapLibreEvent } from 'maplibre-gl';

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
  if (feature.geometry.type === 'Point') {
    const [lon, lat] = feature.geometry.coordinates;
    return <Marker longitude={lon} latitude={lat} />;
  }
  return (
    <Source id="selection" type="geojson" data={feature}>
      <Layer {...selectionLayer} />
    </Source>
  );
}

function SoilhiveSimpleMap({
  initialViewBoundingBox,
  selectedFeature = undefined,
  geometryFeature = undefined,
  showNavigation = true,
  showH3Cells = false,
  mapStyle = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  scrollZoom = true,
  dragPan = true,
}: SoilhiveSimpleMapProps) {
  const mapRef = useRef<any>(null);
  const [h3Cells, setH3Cells] = useState<any | null>(null);

  function updateH3Cells(mapEvent: MapLibreEvent) {
    if (!showH3Cells) {
      setH3Cells(null);
      return;
    }
    try {
      const map = mapEvent.target;
      const zoomLevel = map.getZoom();
      const bounds = map.getBounds().toArray().flat();
      const h3Indexes = bBoxToH3Cells(bounds, h3ResolutionForZoomLevel(zoomLevel));
      const h3CellsFeatureCollection = h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }

  const fitBoundsToGeometryFeature = useCallback(() => {
    if (!geometryFeature) return;
    const simplifiedGeometry: Polygon | MultiPolygon = simplifyGeometry(geometryFeature.features[0].geometry as Polygon | MultiPolygon);
    const largestPolygon = simplifiedGeometry.type === 'MultiPolygon' ? largestPolygonFn(simplifiedGeometry) : simplifiedGeometry;
    if (largestPolygon === null) throw new Error('A valid MultiPolygon should contain at least a Polygon');
    const bbox = bboxFn(largestPolygon!) as [number, number, number, number];
    mapRef.current?.fitBounds(bbox, { padding: 40 });
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
