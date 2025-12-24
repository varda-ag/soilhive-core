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
import { bBoxToH3Cells, h3IndexesToGeoJSONPolygons } from '../../utilities/geo';
import { bbox as bboxFn } from '@turf/turf';
import { h3ResolutionForZoomLevel } from '../../utilities/map';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;

interface SoilhiveSimpleMapProps {
  initialViewBoundingBox?: [number, number, number, number];
  selectedPoint?: [number, number];
  selectedFeature?: any;
  showH3Cells?: boolean;
  showNavigation?: boolean;
  mapStyle: MapStyle;
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
  selectedFeature = null,
  showNavigation = true,
  showH3Cells = false,
  mapStyle = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  scrollZoom = true,
  dragPan = true,
}: SoilhiveSimpleMapProps) {
  const mapRef = useRef<any>(null);
  const [h3Cells, setH3Cells] = useState<any | null>(null);

  function updateH3Cells(mapEvent) {
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
    if (!selectedFeature) {
      return;
    }
    const bbox = bboxFn(selectedFeature);
    mapRef.current?.fitBounds(bbox, { padding: 40 });
  }, [selectedFeature]);

  useEffect(() => {
    fitBoundsToSelectedFeature();
  }, [fitBoundsToSelectedFeature, selectedFeature]);

  function onMapLoad(mapEvent) {
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
        maxZoom={15}
        renderWorldCopies={false}
        dragRotate={false}
        mapStyle={mapStyle}
        {...(initialViewBoundingBox ? { initialViewState: { bounds: initialViewBoundingBox } } : {})}
        onDragEnd={updateH3Cells}
        onLoad={onMapLoad}
        onZoomEnd={updateH3Cells}
        onMoveEnd={updateH3Cells}
      >
        {showH3Cells && h3Cells && (
          <>
            <Source id="data" type="geojson" data={h3Cells} promoteId="h3Index">
              <Layer {...dataLayerBorders} />
            </Source>
            <Source id="selection" type="geojson" data={selectedFeature}>
              <Layer {...dataLayerSelection} />
            </Source>
          </>
        )}
        {selectedPoint && <Marker longitude={selectedPoint[0]} latitude={selectedPoint[1]} />}
        {showNavigation && <NavigationControl position="bottom-right" showCompass={false} showZoom={true} visualizePitch={false} />}
      </Map>
    </div>
  );
}

export default SoilhiveSimpleMap;
