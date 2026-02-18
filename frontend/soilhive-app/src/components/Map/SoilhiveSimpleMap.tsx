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
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { MapLibreEvent } from 'maplibre-gl';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;

interface SoilhiveSimpleMapProps {
  initialViewBoundingBox?: [number, number, number, number];
  selectedPoint?: [number, number];
  selectedFeature?: FeatureCollection;
  showH3Cells?: boolean;
  showNavigation?: boolean;
  mapStyle?: MapStyle;
  scrollZoom?: boolean;
  dragPan?: boolean;
}

const dataLayerSelection: LayerProps = {
  id: 'data-selection',
  type: 'fill',
  paint: {
    'fill-color': '#F5B200',
    'fill-opacity': 0.5,
  },
};

const dataLayerBorders: LayerProps = {
  id: 'data-borders',
  type: 'line',
  paint: {
    'line-color': 'black',
    'line-width': 0.1,
    'line-opacity': 0.5,
  },
};

function SoilhiveSimpleMap({
  initialViewBoundingBox,
  selectedPoint = undefined,
  selectedFeature = undefined,
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

  const fitBoundsToSelectedFeature = useCallback(() => {
    if (!selectedFeature) return;
    const simplifiedGeometry: Polygon | MultiPolygon = simplifyGeometry(selectedFeature.features[0].geometry as Polygon | MultiPolygon);
    const largestPolygon = simplifiedGeometry.type === 'MultiPolygon' ? largestPolygonFn(simplifiedGeometry) : simplifiedGeometry;
    if (largestPolygon === null) throw new Error('A valid MultiPolygon should contain at least a Polygon');
    const bbox = bboxFn(largestPolygon!) as [number, number, number, number];
    mapRef.current?.fitBounds(bbox, { padding: 40 });
  }, [selectedFeature]);

  useEffect(() => {
    if (selectedPoint) {
      mapRef.current?.flyTo({ center: selectedPoint });
    } else {
      fitBoundsToSelectedFeature();
    }
  }, [fitBoundsToSelectedFeature, selectedFeature, selectedPoint]);

  function onMapLoad(mapEvent: MapLibreEvent) {
    updateH3Cells(mapEvent);
    fitBoundsToSelectedFeature();
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
          <Source id="data" type="geojson" data={h3Cells} promoteId="h3Index">
            <Layer {...dataLayerBorders} />
          </Source>
        )}
        {selectedFeature && (
          <Source id="selection" type="geojson" data={selectedFeature}>
            <Layer {...dataLayerSelection} />
          </Source>
        )}
        {selectedPoint && <Marker longitude={selectedPoint[0]} latitude={selectedPoint[1]} />}
        {showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} />}
      </Map>
    </div>
  );
}

export default SoilhiveSimpleMap;
