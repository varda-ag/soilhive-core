import { useId, useRef, useState, useCallback, useEffect, type Dispatch, useMemo } from 'react';
import classnames from 'classnames';
import {
  GeolocateControl,
  Map,
  NavigationControl,
  ScaleControl,
  type MapGeoJSONFeature,
  type StyleSpecification,
  type ImmutableLike,
  type LayerProps,
  Source,
  Layer,
} from 'react-map-gl/maplibre';
import { LngLat, LngLatBounds, type MapLayerMouseEvent } from 'maplibre-gl';
import type { Polygon, MultiPolygon, Point } from 'geojson';
import GeocoderControl from './GeocoderControl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import '../../styles/SoilhiveMap.scss';
import {
  bBoxToH3Cells,
  dataAvailabilityIndexToGeoJSONPolygons,
  h3IndexesToGeoJSONPolygons,
  isPointInFeatureCollection,
} from '../../utilities/geo';
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
import useAvailability from '../../hooks/useAvailability';
import { AreaInfoPopup, AreaInfoBar } from './AreaInfo';

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
  type: 'line',
  paint: {
    'line-color': 'black',
    'line-width': 0.1,
    'line-opacity': 0.5,
  },
};

const dataLayerDAI: LayerProps = {
  id: 'data-dai',
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
  const [selectedLocationName, setSelectedLocationName] = useState<string | undefined>(undefined);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles[0].mapStyle);
  const drawControlRef = useRef<DrawControlRef>(null);
  const selectionTypeRef = useRef<'drawn-polygon' | 'h3-cell' | 'country'>('drawn-polygon');
  const locationNameRef = useRef<string>(undefined);

  // This prevents onMapMoveEnd from being called concurrently with applySelection
  const isApplyingSelection = useRef(false);
  const [daiParams, setDaiParams] = useState<{ bbox: [number, number, number, number]; resolution: number } | null>(null);

  const ENABLE_DAI = ((window._env_ as any)?.['ENABLE_DAI'] as string) === 'true';

  const { dai } = useDai(filterId, daiParams?.bbox, daiParams?.resolution, ENABLE_DAI && !!filterId && daiParams !== null && showH3Cells);

  useEffect(() => {
    if (!daiParams || !showH3Cells || (ENABLE_DAI && !dai)) return;
    try {
      const h3Indexes = bBoxToH3Cells(daiParams?.bbox, h3ResolutionForZoomLevel(daiParams?.resolution));
      const h3CellsFeatureCollection = ENABLE_DAI ? dataAvailabilityIndexToGeoJSONPolygons(dai!) : h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }, [dai, daiParams, showH3Cells, setH3Cells, ENABLE_DAI]);

  const { isMobileLayout, isDesktopLayout } = useDevice();

  const onAreaInfoClose = useCallback(() => {
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
      setSelectedLocationName(undefined);
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
    setSelectedLocationName(undefined);
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
        setSelectedLocationName(undefined);
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
      setSelectedLocationName(feature?.properties?.display_name);

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
      setSelectedLocationName(undefined);
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

  const isAreaInfoVisible = useMemo(() => {
    return selectedPoint && !showDrawControl;
  }, [selectedPoint, showDrawControl]);

  return (
    <div
      className={classnames('soilhive-map', {
        'soilhive-map-show-selection-toolbar': showSelectionToolbar,
      })}
    >
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

        {isDesktopLayout && isAreaInfoVisible && (
          <AreaInfoPopup
            selectedPoint={selectedPoint as LngLat}
            onClose={onAreaInfoClose}
            locationName={selectedLocationName}
            selection={selection}
          />
        )}

        {showH3Cells && h3Cells && !showDrawControl && (
          <>
            <Source id="data" type="geojson" data={h3Cells} promoteId="h3Index">
              <Layer {...dataLayerFills} />
              <Layer {...dataLayerBorders} />
              {ENABLE_DAI && <Layer {...dataLayerDAI} />}
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
        {mapStyles.length > 1 && <MapStyleSwitcher mapStyles={mapStyles} onMapStyleChange={setCurrentMapStyle} />}
      </Map>
      {!isDesktopLayout && isAreaInfoVisible && (
        <AreaInfoBar onClose={onAreaInfoClose} locationName={selectedLocationName} selection={selection} />
      )}
    </div>
  );
}

export default SoilhiveMap;
