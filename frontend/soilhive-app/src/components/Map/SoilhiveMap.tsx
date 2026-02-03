import { Activity, useId, useRef, useState, useCallback, type Dispatch, useMemo, useEffect } from 'react';
import {
  GeolocateControl,
  Map,
  NavigationControl,
  ScaleControl,
  type MapGeoJSONFeature,
  type StyleSpecification,
  type ImmutableLike,
  type LayerProps,
  Popup,
  Source,
  Layer,
} from 'react-map-gl/maplibre';
import { LngLat, type MapLayerMouseEvent, type Offset } from 'maplibre-gl';
import type { FeatureCollection, Polygon, MultiPolygon, Point } from 'geojson';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import '../../styles/SoilhiveMap.scss';
import Flower from 'assets/images/flower.svg?react';
import { bBoxToH3Cells, h3IndexesToGeoJSONPolygons, isPointInFeatureCollection } from '../../utilities/geo';
import { area, bbox as bboxFn, centerOfMass, convertArea, round } from '@turf/turf';
import { h3ResolutionForZoomLevel } from '../../utilities/map';
import DrawControl from '../DrawControl';
import SoilhiveMapToolbar from './SoilhiveMapToolbar';
import SoilhiveMapSelectionToolbar from './SoilhiveMapSelectionToolbar';
import { largestPolygon as largestPolygonFn } from '../../utilities/geo';
import type { SoilhiveMapSelectionChangeEvent } from './SoilhiveMapSelectionChangeEvent';
import { simplifyGeometry } from '../../utilities/simplifyGeometry';
import useDevice from 'hooks/useDevice';

type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;
type MapStyles = Array<{ name: string; mapStyle: MapStyle }>;

function MapStyleSwitcher({ mapStyles, onMapStyleChange }: { mapStyles: MapStyles; onMapStyleChange: Dispatch<MapStyle> }) {
  const id = useId();
  return (
    <div className="map-style-switcher">
      {/* <label for={id}>Map style</label>  */}
      <select
        name="map-styles"
        id={id}
        defaultValue={0}
        onChange={event => {
          const selectedIndex = Number(event.target.value);
          onMapStyleChange(mapStyles[selectedIndex].mapStyle);
        }}
      >
        {mapStyles.map(({ name }, index) => {
          return (
            <option key={index} value={index}>
              {name}
            </option>
          );
        })}
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
  onSelectionChange?: (event: SoilhiveMapSelectionChangeEvent) => void;
  onSelectionToolbarVisibilityChange?: (isVisible: boolean) => void;
}

const dataLayerFills: LayerProps = {
  id: 'data-fills',
  type: 'fill',
  paint: {
    'fill-color': '#F5B200',
    'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, 0],
  },
};

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

function SoilhiveMap({
  initialViewBoundingBox,
  showGeocoder = false,
  geocoder = 'nominatim',
  showNavigation = true,
  showGeolocation = true,
  showScale = true,
  showH3Cells = false,
  mapStyles = [{ name: 'CartoCDN Voyager', mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' }],
  scrollZoom = true,
  dragPan = true,
  onSelectionChange,
  onSelectionToolbarVisibilityChange,
}: SoilhiveMapProps) {
  const emptySelection = useMemo(() => {
    return { type: 'FeatureCollection', features: [] };
  }, []);
  const mapRef = useRef<any>(null);
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles[0].mapStyle);
  const [selectedPoint, setSelectedPoint] = useState<LngLat | null>(null);
  const [selectedH3Cell, setSelectedH3Cell] = useState<MapGeoJSONFeature | null>(null);
  const [h3Cells, setH3Cells] = useState<FeatureCollection | null>(null);
  const [selection, setSelection] = useState<{ type: string; features: GeoJSON.GeoJSON[] }>(emptySelection);
  const [showDrawControl, setShowDrawControl] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);

  // This prevents onMapMoveEnd from being called concurrently with applySelection
  const isApplyingSelection = useRef(false);

  const { isMobileLayout } = useDevice();

  useEffect(() => {
    console.log('isMobileLayout', isMobileLayout);
  }, [isMobileLayout]);

  useEffect(() => {
    // Closes the attribution controls on mount so as to occupate less space by default
    setTimeout(() => {
      // Makes selection
      const details = document.querySelector('details.maplibregl-ctrl-attrib') as HTMLDetailsElement | null;
      details?.removeAttribute('open');
      details?.classList.remove('maplibregl-compact-show');
    }, 0);
  }, []);

  const onDrawClick = useCallback(() => {
    setShowDrawControl(true);
    setShowSelectionToolbar(true);
    onSelectionToolbarVisibilityChange?.(true);
    setTimeout(() => {
      // Makes selection
      const btn = document.querySelector('button.maplibregl-terradraw-add-polygon-button') as HTMLButtonElement | null;
      btn?.click();
    }, 0);
  }, [onSelectionToolbarVisibilityChange]);

  const applySelection = useCallback(
    (geometry: Polygon | MultiPolygon, point?: Point, moveBounds?: boolean) => {
      isApplyingSelection.current = true;
      const simplifiedGeometry: Polygon | MultiPolygon = simplifyGeometry(geometry);
      const largestPolygon = simplifiedGeometry.type === 'MultiPolygon' ? largestPolygonFn(simplifiedGeometry) : simplifiedGeometry;
      if (largestPolygon === null) throw new Error('A valid MultiPolygon should contain at least a Polygon');
      const [lng, lat] = point ? point.coordinates : centerOfMass(largestPolygon).geometry.coordinates;
      const bbox = bboxFn(largestPolygon!);
      if (moveBounds) mapRef.current.fitBounds(bbox, { padding: 40 });
      setSelectedPoint(new LngLat(lng, lat));
      setShowSelectionToolbar(true);
      onSelectionToolbarVisibilityChange?.(true);
      setSelection({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: simplifiedGeometry, properties: {} }] });
      onSelectionChange?.({
        bounds: mapRef.current.getBounds().toArray().flat(),
        geometries: [simplifiedGeometry as Polygon | MultiPolygon],
        zoomLevel: mapRef.current.getZoom(),
      });
      isApplyingSelection.current = false;
    },
    [onSelectionChange, onSelectionToolbarVisibilityChange],
  );

  const onUpload = useCallback(
    (geometry: Polygon | MultiPolygon) => {
      // Uploading a polygon from file
      applySelection(geometry, undefined, true);
    },
    [applySelection],
  );

  const updateH3Cells = useCallback(
    ({ bounds, zoomLevel }: { bounds: number[]; zoomLevel: number }) => {
      if (!showH3Cells) {
        setH3Cells(null);
        return;
      }

      try {
        const h3Indexes = bBoxToH3Cells(bounds, h3ResolutionForZoomLevel(zoomLevel));
        const h3CellsFeatureCollection = h3IndexesToGeoJSONPolygons(h3Indexes);
        setH3Cells(h3CellsFeatureCollection);
      } catch (error) {
        console.error('Error while updating the H3 Cells:', error);
      }
    },
    [showH3Cells],
  );

  const onMapMoveEnd = useCallback(
    (mapEvent: any) => {
      if (isApplyingSelection.current) return; // Skip during selection

      const map = mapEvent.target;
      const bounds = map.getBounds().toArray().flat();
      const zoomLevel = map.getZoom();

      if (selection.features.length === 0) {
        // Current bbox (implicit) selection
        onSelectionChange?.({ bounds, zoomLevel });
      }

      updateH3Cells({ bounds, zoomLevel });
    },
    [onSelectionChange, selection.features.length, updateH3Cells],
  );

  const resetSelection = useCallback(() => {
    if (!mapRef.current) {
      // Otherwise when the popup is closed when changing page it won't find any Map as it has been already unmounted
      return;
    }
    if (selectedH3Cell) {
      mapRef.current.setFeatureState({ source: 'data', id: selectedH3Cell.id }, { selected: false });
      setSelectedH3Cell(null);
    }
    setSelectedPoint(null);
    setSelection(emptySelection);
    setShowDrawControl(false);
    setShowSelectionToolbar(false);
    onSelectionToolbarVisibilityChange?.(false);
    onSelectionChange?.({
      bounds: mapRef.current.getMap().getBounds().toArray().flat(),
      zoomLevel: mapRef.current.getZoom(),
    });
  }, [emptySelection, onSelectionChange, onSelectionToolbarVisibilityChange, selectedH3Cell]);

  const onMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const { lng, lat } = event.lngLat;
      const features: MapGeoJSONFeature[] = event.features ?? [];
      if (selection && isPointInFeatureCollection([lng, lat], selection)) {
        setSelectedPoint(event.lngLat);
      } else if (features.length > 0) {
        // H3 cell selection
        applySelection(features[0].geometry as Polygon, { type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] }, false);
        setSelectedH3Cell(features[0]);
      }
    },
    [selection, applySelection],
  );

  const onSearchResultSelect = useCallback(
    ({ feature }: { feature: MapGeoJSONFeature; center: Point }) => {
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        // Selecting a search result from the geocoder
        applySelection(feature.geometry, undefined, true);
      } else {
        // Just move bounds
        mapRef.current.fitBounds(bboxFn(feature), { padding: 40 });
      }
    },
    [applySelection],
  );

  const onFinishDrawing = useCallback(
    (feature: MapGeoJSONFeature) => {
      // Drawing a polygon on the map
      applySelection(feature.geometry as Polygon);
      setShowDrawControl(false);
    },
    [applySelection],
  );

  return (
    <div className={`soilhive-map${showSelectionToolbar ? ' soilhive-map-show-selection-toolbar' : ''}`}>
      <Map
        ref={mapRef}
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        minZoom={3}
        maxZoom={15}
        renderWorldCopies={false}
        dragRotate={false}
        mapStyle={currentMapStyle}
        {...(initialViewBoundingBox ? { initialViewState: { bounds: initialViewBoundingBox } } : {})}
        onDragEnd={onMapMoveEnd}
        onLoad={onMapMoveEnd}
        onZoomEnd={onMapMoveEnd}
        onMoveEnd={onMapMoveEnd}
        onClick={onMapClick}
        interactiveLayerIds={['data-fills']}
      >
        <Activity mode={!showSelectionToolbar ? 'visible' : 'hidden'}>
          <SoilhiveMapToolbar onDrawClick={onDrawClick} onUpload={onUpload} />
        </Activity>

        {showSelectionToolbar && (
          <SoilhiveMapSelectionToolbar
            area={round(convertArea(area(selection as GeoJSON.GeoJSON), 'meters', 'kilometers'), 3)}
            onCancel={resetSelection}
            onReset={resetSelection}
            onDrawAnother={() => {}}
            onShowResults={() => {}}
          />
        )}

        {selectedPoint && (
          <Popup
            anchor="left"
            longitude={selectedPoint.lng}
            latitude={selectedPoint.lat}
            closeOnClick={false}
            offset={
              {
                left: [0, 0],
                top: [0, 0],
                'top-left': [0, 0],
                bottom: [0, 0],
              } as Offset
            }
            onClose={resetSelection}
          >
            <div className="soilhive-map-popup-header">
              <div className="soilhive-map-popup-header-left" style={{ minWidth: '24px' }}>
                <Flower />
              </div>
              <div className="soilhive-map-popup-header-right">
                <div className="soilhive-map-popup-header-right-title">SOIL DATA</div>
                <div className="soilhive-map-popup-header-right-subtitle">H3 Cell ID: {selectedH3Cell ? selectedH3Cell.id : '-'}</div>
              </div>
            </div>
            <div className="soilhive-map-popup-content">
              <strong>Coordinates</strong>
              <br />
              Longitude {selectedPoint.lng.toFixed(6)}
              <br />
              Latitude {selectedPoint.lat.toFixed(6)}
            </div>
          </Popup>
        )}

        {showH3Cells && h3Cells && !showDrawControl && (
          <>
            <Source id="data" type="geojson" data={h3Cells} promoteId="h3Index">
              <Layer {...dataLayerFills} />
              <Layer {...dataLayerBorders} />
            </Source>
            <Source id="selection" type="geojson" data={selection as GeoJSON.GeoJSON}>
              <Layer {...dataLayerSelection} />
            </Source>
          </>
        )}

        {showGeocoder && <GeocoderControl position="top-left" geocoder={geocoder} onFeatureSelect={onSearchResultSelect} />}
        {showGeolocation && <GeolocateControl position="bottom-right" />}
        {showNavigation && (
          <NavigationControl
            // `key` forces re-creation otherwise it won't change the showZoom status when isMobileLayout changes
            // because since mapbox-gl internally uses an imperative method to add controls (e.g. `map.addControl()`)
            // the react wrapper library probably doesn't implement correctly a `useEffect` to update them and so the
            // component remains in the initial state.
            key={isMobileLayout ? 'mobile' : 'desktop'}
            position="bottom-right"
            showCompass={false}
            showZoom={isMobileLayout}
            visualizePitch={false}
          />
        )}
        {showDrawControl && <DrawControl position="bottom-right" onFinish={onFinishDrawing} />}

        {showScale && <ScaleControl />}
      </Map>
      {mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} />}
    </div>
  );
}

export default SoilhiveMap;
