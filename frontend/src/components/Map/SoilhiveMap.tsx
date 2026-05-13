import { useId, useRef, useState, useCallback, useEffect, type Dispatch, useMemo } from 'react';
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
import { LngLat, LngLatBounds, type MapLayerMouseEvent, type Offset } from 'maplibre-gl';
import type { Polygon, MultiPolygon, Point } from 'geojson';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import '../../styles/SoilhiveMap.scss';
import Flower from 'assets/images/flower.svg?react';
import { dataAvailabilityIndexToGeoJSONPolygons, isPointInFeatureCollection } from '../../utilities/geo';
import { bbox as bboxFn, centerOfMass } from '@turf/turf';
import { getMapStyles, h3ResolutionForZoomLevel } from '../../utilities/map';
import DrawControl, { type DrawControlRef } from '../DrawControl';
import SoilhiveMapToolbar from './SoilhiveMapToolbar';
import SoilhiveMapSelectionToolbar, { type SoilhiveMapSelectionToolbarMode } from './SoilhiveMapSelectionToolbar';
import { largestPolygon as largestPolygonFn } from '../../utilities/geo';
import type { SoilhiveMapSelectionChangeEvent } from './SoilhiveMapSelectionChangeEvent';
import { simplifyGeometry } from '../../utilities/simplifyGeometry';
import useDevice from 'hooks/useDevice';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import { useDai } from 'hooks/useDai';
import { useTranslation } from 'react-i18next';
import useAvailability from '../../hooks/useAvailability';

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
    'fill-opacity': 0.2,
  },
};

const dataLayerBorders: LayerProps = {
  id: 'data-borders',
  type: 'fill',
  paint: {
    'fill-opacity': [
      'interpolate',
      ['linear'],
      ['get', 'dai'], // the numeric property
      0,
      0.0,
      0.01,
      0.1,
      0.5,
      0.25,
      1.0,
      0.75,
    ],
    'fill-color': [
      'interpolate',
      ['linear'],
      ['get', 'dai'], // the numeric property
      0,
      '#ffffcc', // low  → light yellow
      0.5,
      '#fd8d3c', // mid → orange
      1.0,
      '#800026', // high → dark red
    ],
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
  mapStyles = getMapStyles(),
  scrollZoom = true,
  dragPan = true,
  onSelectionChange,
  onSelectionToolbarVisibilityChange,
}: SoilhiveMapProps) {
  const {
    selectedPoint,
    selectedH3Cell,
    h3Cells,
    emptySelection,
    selection,
    showDrawControl,
    showSelectionToolbar,
    setSelectedPoint,
    setSelectedH3Cell,
    setH3Cells,
    setSelection,
    setShowDrawControl,
    setShowSelectionToolbar,
  } = useAvailabilityMap();

  const { filterId } = useAvailability();

  const mapRef = useRef<any>(null);
  const [isPointResultSelection, setIsPointResultSelection] = useState(false);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles[0].mapStyle);
  const drawControlRef = useRef<DrawControlRef>(null);
  const selectionTypeRef = useRef<'drawn-polygon' | 'h3-cell' | 'country'>('drawn-polygon');
  const locationNameRef = useRef<string>(undefined);

  // This prevents onMapMoveEnd from being called concurrently with applySelection
  const isApplyingSelection = useRef(false);
  const [daiParams, setDaiParams] = useState<{ bbox: [number, number, number, number]; resolution: number } | null>(null);

  const { dai } = useDai(filterId, daiParams?.bbox, daiParams?.resolution, !!filterId && daiParams !== null && showH3Cells);

  useEffect(() => {
    if (!daiParams || !showH3Cells || !dai) return;
    try {
      const h3CellsFeatureCollection = dataAvailabilityIndexToGeoJSONPolygons(dai);
      console.log(h3CellsFeatureCollection);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }, [dai, daiParams, showH3Cells, setH3Cells]);

  const { isMobileLayout } = useDevice();
  const { t } = useTranslation('availability');

  const onPopupClose = useCallback(() => {
    setSelectedPoint(null);
  }, [setSelectedPoint]);

  const onDrawClick = useCallback(() => {
    setSelectedPoint(null);
    setShowDrawControl(true);
    setShowSelectionToolbar(true);
    onSelectionToolbarVisibilityChange?.(true);
    setTimeout(() => {
      // Makes selection
      const btn = document.querySelector('button.maplibregl-terradraw-add-polygon-button') as HTMLButtonElement | null;
      btn?.click();
    }, 0);
  }, [onSelectionToolbarVisibilityChange, setShowDrawControl, setShowSelectionToolbar, setSelectedPoint]);

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
        bounds: moveBounds ? bbox : mapRef.current.getBounds().toArray().flat(),
        geometries: [simplifiedGeometry as Polygon | MultiPolygon],
        selectionType: selectionTypeRef.current,
        locationName: locationNameRef.current,
      });
      locationNameRef.current = undefined;
      isApplyingSelection.current = false;
    },
    [onSelectionChange, onSelectionToolbarVisibilityChange, setSelectedPoint, setSelection, setShowSelectionToolbar],
  );

  const onUpload = useCallback(
    (geometry: Polygon | MultiPolygon) => {
      // Uploading a polygon from file
      selectionTypeRef.current = 'drawn-polygon';
      applySelection(geometry, undefined, true);
    },
    [applySelection],
  );

  const updateH3Cells = useCallback(
    ({ bounds, zoomLevel }: { bounds: number[]; zoomLevel: number }) => {
      if (!showH3Cells) {
        setH3Cells(null);
        setDaiParams(null);
        return;
      }
      setDaiParams({ bbox: bounds as [number, number, number, number], resolution: h3ResolutionForZoomLevel(zoomLevel) });
    },
    [showH3Cells, setH3Cells],
  );

  const onMapMoveEnd = useCallback(
    (mapEvent: any) => {
      if (isApplyingSelection.current) return; // Skip during selection

      const map = mapEvent.target;
      const mapLngLatBounds = map.getBounds();
      setMapBounds(mapLngLatBounds);
      const bounds = mapLngLatBounds.toArray().flat();
      const zoomLevel = map.getZoom();
      const isUserInteraction = mapEvent.originalEvent ? true : false;

      if (isPointResultSelection || (isUserInteraction && selection.features.length === 0)) {
        // If the user moves the map and there is no selection,
        // update the (implicit) selection to the current bounds
        selectionTypeRef.current = 'drawn-polygon';
        onSelectionChange?.({ bounds, selectionType: selectionTypeRef.current });
        setIsPointResultSelection(false);
      }

      updateH3Cells({ bounds, zoomLevel });
    },
    [isPointResultSelection, onSelectionChange, selection.features.length, updateH3Cells],
  );

  const onLoad = useCallback(
    (mapEvent: any) => {
      onMapMoveEnd(mapEvent);
    },
    [onMapMoveEnd],
  );

  const resetDrawing = useCallback(() => {
    drawControlRef.current?.reset();
  }, []);

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
    selectionTypeRef.current = 'drawn-polygon';
    setShowDrawControl(false);
    setShowSelectionToolbar(false);
    onSelectionToolbarVisibilityChange?.(false);
    onSelectionChange?.({
      bounds: mapRef.current.getMap().getBounds().toArray().flat(),
      selectionType: selectionTypeRef.current,
    });
  }, [
    emptySelection,
    onSelectionChange,
    onSelectionToolbarVisibilityChange,
    selectedH3Cell,
    setSelectedH3Cell,
    setSelectedPoint,
    setSelection,
    setShowDrawControl,
    setShowSelectionToolbar,
  ]);

  const onMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (showDrawControl) return;
      const { lng, lat } = event.lngLat;
      const features: MapGeoJSONFeature[] = event.features ?? [];
      if (selection && isPointInFeatureCollection([lng, lat], selection)) {
        setSelectedPoint(event.lngLat);
      } else if (features.length > 0) {
        // H3 cell selection
        selectionTypeRef.current = 'h3-cell';
        applySelection(features[0].geometry as Polygon, { type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] }, false);
        setSelectedH3Cell(features[0]);
      }
    },
    [showDrawControl, selection, setSelectedPoint, applySelection, setSelectedH3Cell],
  );

  const onSearchResultSelect = useCallback(
    ({ feature }: { feature: MapGeoJSONFeature; center: Point }) => {
      selectionTypeRef.current = 'country';
      locationNameRef.current = feature?.properties?.display_name;

      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        // Selecting a search result from the geocoder
        applySelection(feature.geometry, undefined, true);
      } else {
        // Just move bounds
        mapRef.current.fitBounds(bboxFn(feature), { padding: 40 });
        // This is necessary to trigger new bbox coverage query
        setIsPointResultSelection(true);
      }
    },
    [applySelection],
  );

  const onFinishDrawing = useCallback(
    (feature: MapGeoJSONFeature) => {
      // Drawing a polygon on the map
      selectionTypeRef.current = 'drawn-polygon';
      applySelection(feature.geometry as Polygon);
      setShowDrawControl(false);
    },
    [applySelection, setShowDrawControl],
  );

  const toolbarMode: SoilhiveMapSelectionToolbarMode = useMemo(() => {
    if (showDrawControl) return 'drawing';
    if (selection.features.length > 0 && mapBounds) {
      const geometry = (selection.features[0] as GeoJSON.Feature).geometry as Polygon | MultiPolygon;
      const largestPolygon = geometry.type === 'MultiPolygon' ? largestPolygonFn(geometry) : geometry;
      const selectionBbox = bboxFn(largestPolygon);

      // Return 'search' if less than 20% of the selection is visible in the map viewbox
      const selWidth = selectionBbox[2] - selectionBbox[0];
      const selHeight = selectionBbox[3] - selectionBbox[1];
      const selArea = selWidth * selHeight;
      if (selArea > 0) {
        const visibleWidth = Math.max(0, Math.min(selectionBbox[2], mapBounds.getEast()) - Math.max(selectionBbox[0], mapBounds.getWest()));
        const visibleHeight = Math.max(
          0,
          Math.min(selectionBbox[3], mapBounds.getNorth()) - Math.max(selectionBbox[1], mapBounds.getSouth()),
        );
        if ((visibleWidth * visibleHeight) / selArea < 0.2) return 'search';
      }

      const mapWidth = mapBounds.getEast() - mapBounds.getWest();
      const mapHeight = mapBounds.getNorth() - mapBounds.getSouth();
      const ratio = (selWidth * selHeight) / (mapWidth * mapHeight);
      if (ratio >= 1) return 'search';
    }
    return 'clear';
  }, [showDrawControl, selection, mapBounds]);

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
        onLoad={onLoad}
        onDragEnd={onMapMoveEnd}
        onZoomEnd={onMapMoveEnd}
        onMoveEnd={onMapMoveEnd}
        onClick={onMapClick}
        interactiveLayerIds={['data-fills']}
        attributionControl={{ compact: false }}
      >
        <SoilhiveMapToolbar visible={!showDrawControl} onDrawClick={onDrawClick} onUpload={onUpload} />

        {showSelectionToolbar && <SoilhiveMapSelectionToolbar mode={toolbarMode} onCancel={resetSelection} onReset={resetDrawing} />}

        {selectedPoint && !showDrawControl && (
          <Popup
            anchor="left"
            longitude={selectedPoint.lng}
            latitude={selectedPoint.lat}
            closeOnClick={false}
            onClose={onPopupClose}
            offset={
              {
                left: [0, 0],
                top: [0, 0],
                'top-left': [0, 0],
                bottom: [0, 0],
              } as Offset
            }
          >
            <div className="soilhive-map-popup-header">
              <div className="soilhive-map-popup-header-left" style={{ minWidth: '24px' }}>
                <Flower />
              </div>
              <div className="soilhive-map-popup-header-right">
                <div className="soilhive-map-popup-header-right-title">{t('map_popup.title')}</div>
                <div className="soilhive-map-popup-header-right-subtitle">
                  {t('map_popup.h3_cell_id', { id: selectedH3Cell ? selectedH3Cell.id : '-' })}
                </div>
              </div>
            </div>
            <div className="soilhive-map-popup-content">
              <strong>{t('map_popup.coordinates')}</strong>
              <br />
              {t('map_popup.longitude', { lng: selectedPoint.lng.toFixed(6) })}
              <br />
              {t('map_popup.latitude', { lat: selectedPoint.lat.toFixed(6) })}
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
            showZoom={!isMobileLayout}
            visualizePitch={false}
          />
        )}
        {showDrawControl && <DrawControl ref={drawControlRef} position="bottom-right" onFinish={onFinishDrawing} />}

        {showScale && <ScaleControl />}
      </Map>
      {mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} />}
    </div>
  );
}

export default SoilhiveMap;
