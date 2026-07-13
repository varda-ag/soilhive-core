import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';
import {
  GeolocateControl,
  Map,
  NavigationControl,
  ScaleControl,
  type MapGeoJSONFeature,
  type LayerProps,
  Source,
  Layer,
} from 'react-map-gl/maplibre';
import { LngLat, LngLatBounds, type MapLayerMouseEvent, type MapLibreEvent } from 'maplibre-gl';
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
import { parseGeoJSONFile } from '../../utilities/parseGeoJSONFile';
import useNotifications from 'hooks/useNotifications';
import SoilhiveMapSelectionToolbar, { type SoilhiveMapSelectionToolbarMode } from './SoilhiveMapSelectionToolbar';
import { largestPolygon as largestPolygonFn } from '../../utilities/geo';
import type { SoilhiveMapSelectionChangeEvent } from './SoilhiveMapSelectionChangeEvent';
import { simplifyGeometry } from '../../utilities/simplifyGeometry';
import useDevice from 'hooks/useDevice';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import { useDai } from 'hooks/useDai';
import useAvailability from '../../hooks/useAvailability';
import useTheme from 'hooks/useTheme';
import { AreaInfoPopup, AreaInfoBar } from './AreaInfo';
import { DaiWidget } from './DaiWidget/DaiWidget';
import LayersIcon from 'assets/icons/layers-icon.svg?react';
import UploadIcon from 'assets/icons/big-cloud-upload-icon.svg?react';
import type { MapStyles } from 'types/components';
import { MapStyleSwitcher } from './MapStyleSwitcher/MapStyleSwitcher';
import LoadingLine from './LoadingLine/LoadingLine';

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
  enableFileDrop?: boolean;
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

// How long the ScaleControl stays visible after zooming stops before it starts fading out
const SCALE_LINGER_MS = 1000;
// How long the ScaleControl's fade-out transition takes
const SCALE_FADE_MS = 300;

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
  enableFileDrop = false,
  onSelectionChange,
  onSelectionToolbarVisibilityChange,
}: SoilhiveMapProps) {
  const { t } = useTranslation('availability');
  const {
    selectedPoint,
    selectedH3Cell,
    h3Cells,
    emptySelection,
    selection,
    showDrawControl,
    showSelectionToolbar,
    isDaiEnabled,
    daiOpacity,
    setSelectedPoint,
    setSelectedH3Cell,
    setH3Cells,
    setSelection,
    setShowDrawControl,
    setShowSelectionToolbar,
    setIsDaiEnabled,
    setDaiOpacity,
  } = useAvailabilityMap();

  const { filterId, isLoadingPartialFilter } = useAvailability();
  const { showNotification } = useNotifications();

  const mapRef = useRef<any>(null);
  const [isPointResultSelection, setIsPointResultSelection] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const [selectedLocationName, setSelectedLocationName] = useState<string | undefined>(undefined);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [currentMapStyleIndex, setCurrentMapStyleIndex] = useState<number>(0);
  const [isScaleMounted, setIsScaleMounted] = useState(false);
  const [isScaleVisible, setIsScaleVisible] = useState(false);
  const scaleHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleUnmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { themeConfig } = useTheme();
  const drawControlRef = useRef<DrawControlRef>(null);
  const selectionTypeRef = useRef<'drawn-polygon' | 'h3-cell' | 'country'>('drawn-polygon');
  const locationNameRef = useRef<string>(undefined);

  // This prevents onMapMoveEnd from being called concurrently with applySelection
  const isApplyingSelection = useRef(false);
  const [isDaiWidgetOpen, setIsDaiWidgetOpen] = useState(false);
  const dataLayerDAI = useMemo<LayerProps>(
    () => ({
      id: 'data-dai',
      type: 'fill',
      paint: {
        'fill-opacity': [
          'case',
          ['has', 'dai'],
          ['*', daiOpacity / 100, ['interpolate', ['linear'], ['get', 'dai'], 0, 0.0, 0.01, 0.1, 0.5, 0.25, 1.0, 0.75]],
          0,
        ],
        'fill-color': ['interpolate', ['linear'], ['get', 'dai'], 0, '#ffffcc', 0.5, '#fd8d3c', 1.0, '#800026'],
      },
    }),
    [daiOpacity],
  );
  const [daiParams, setDaiParams] = useState<{ bbox: [number, number, number, number]; resolution: number } | null>(null);

  // const ENABLE_DAI = ((window._env_ as any)?.['ENABLE_DAI'] as string) === 'true';

  const { dai, isLoading: isDaiLoading } = useDai(
    filterId,
    daiParams?.bbox,
    daiParams?.resolution,
    isDaiEnabled && !!filterId && !isLoadingPartialFilter && daiParams !== null && showH3Cells,
  );

  useEffect(() => {
    if (!daiParams || !showH3Cells || (isDaiEnabled && !dai)) return;
    try {
      const h3Indexes = bBoxToH3Cells(daiParams?.bbox, h3ResolutionForZoomLevel(daiParams?.resolution));
      const h3CellsFeatureCollection = isDaiEnabled ? dataAvailabilityIndexToGeoJSONPolygons(dai!) : h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }, [dai, daiParams, showH3Cells, setH3Cells, isDaiEnabled]);

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

  const onDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!enableFileDrop) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setIsDragOver(true);
    },
    [enableFileDrop],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!enableFileDrop) return;
      event.preventDefault();
    },
    [enableFileDrop],
  );

  const onDragLeave = useCallback(
    (_event: React.DragEvent<HTMLDivElement>) => {
      if (!enableFileDrop) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) setIsDragOver(false);
    },
    [enableFileDrop],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!enableFileDrop) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      const result = await parseGeoJSONFile(file);
      if (result.error) {
        showNotification({ id: result.error.id, title: 'Upload failed', message: result.error.message });
        return;
      }

      onUpload(result.polygon);
    },
    [enableFileDrop, onUpload, showNotification],
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

  const onMapZoomStart = useCallback(() => {
    if (isDesktopLayout) return;
    if (scaleHideTimeoutRef.current) clearTimeout(scaleHideTimeoutRef.current);
    if (scaleUnmountTimeoutRef.current) clearTimeout(scaleUnmountTimeoutRef.current);
    setIsScaleMounted(true);
    setIsScaleVisible(true);
  }, [isDesktopLayout]);

  const onMapZoomEnd = useCallback(
    (mapEvent: any) => {
      onMapMoveEnd(mapEvent);
      if (isDesktopLayout) return;
      scaleHideTimeoutRef.current = setTimeout(() => {
        setIsScaleVisible(false);
        scaleUnmountTimeoutRef.current = setTimeout(() => setIsScaleMounted(false), SCALE_FADE_MS);
      }, SCALE_LINGER_MS);
    },
    [isDesktopLayout, onMapMoveEnd],
  );

  useEffect(() => {
    return () => {
      if (scaleHideTimeoutRef.current) clearTimeout(scaleHideTimeoutRef.current);
      if (scaleUnmountTimeoutRef.current) clearTimeout(scaleUnmountTimeoutRef.current);
    };
  }, []);

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
    // Removes the last searched place from the geocoder's input in the toolbar otherwise if you search for the same
    // place again it doesnt re-select the area
    (document.querySelector('.maplibregl-ctrl-geocoder--button') as HTMLButtonElement)?.click();
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

  const attributionControl = useMemo(() => {
    return isMobileLayout ? { compact: true } : { compact: false };
  }, [isMobileLayout]);

  const onMapRender = useCallback(
    (mapEvent: MapLibreEvent) => {
      if (!isMobileLayout) return;
      // Closes the attribution element that shows copyrights on the map since it can be very long and obstruct the view.
      // It can be re-opened by clicking on the info button.
      const attributionEl = mapEvent.target.getContainer().querySelector('.maplibregl-ctrl-attrib');
      attributionEl?.removeAttribute('open');
      attributionEl?.classList.remove('maplibregl-compact-show');
    },
    [isMobileLayout],
  );

  return (
    <div
      className={classnames('soilhive-map', {
        'soilhive-map-show-selection-toolbar': showSelectionToolbar,
      })}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {enableFileDrop && isDragOver && (
        <div className="soilhive-map-drop-overlay">
          <div className="soilhive-map-drop-overlay-content">
            <UploadIcon />
            <p className="soilhive-map-drop-overlay-message">{t('map.drop_file_message')}</p>
            <p className="soilhive-map-drop-overlay-caption">{t('map.drop_file_caption')}</p>
          </div>
        </div>
      )}
      <Map
        ref={mapRef}
        scrollZoom={scrollZoom}
        dragPan={dragPan}
        minZoom={3}
        maxZoom={15}
        renderWorldCopies={false}
        dragRotate={false}
        mapStyle={mapStyles[currentMapStyleIndex].mapStyle}
        {...(initialViewBoundingBox ? { initialViewState: { bounds: initialViewBoundingBox } } : {})}
        onLoad={onLoad}
        onDragEnd={onMapMoveEnd}
        onZoomStart={onMapZoomStart}
        onZoomEnd={onMapZoomEnd}
        onMoveEnd={onMapMoveEnd}
        onClick={onMapClick}
        onRender={onMapRender}
        interactiveLayerIds={['data-fills']}
        // Note: attributionControl is used only during the onLoad so it won't be updated if it changes after that (e.g. when in Desktop you resize the window to make it small as a Mobile device)
        attributionControl={attributionControl}
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
              {isDaiEnabled && <Layer {...dataLayerBorders} />}
              {isDaiEnabled && !!dai && !isDaiLoading && <Layer {...dataLayerDAI} />}
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
            key={isDesktopLayout ? 'desktop' : 'mobile'}
            position="bottom-right"
            showCompass={false}
            showZoom={isDesktopLayout}
            visualizePitch={false}
          />
        )}
        {showDrawControl && <DrawControl ref={drawControlRef} position="bottom-right" onFinish={onFinishDrawing} />}

        {showScale && (isDesktopLayout || isScaleMounted) && (
          <ScaleControl
            style={isDesktopLayout ? undefined : { opacity: isScaleVisible ? 1 : 0, transition: `opacity ${SCALE_FADE_MS}ms ease` }}
          />
        )}
        {mapStyles.length > 1 && (
          <MapStyleSwitcher
            className="map-style-switcher"
            mapStyles={mapStyles}
            currentValue={currentMapStyleIndex}
            onMapStyleChange={setCurrentMapStyleIndex}
          />
        )}
        {themeConfig.daiConfig?.isEnabled && !isDesktopLayout && (
          <button className="soilhive-map-dai-btn" onClick={() => setIsDaiWidgetOpen(v => !v)}>
            <LayersIcon />
          </button>
        )}
        {themeConfig.daiConfig?.isEnabled && (isDesktopLayout || isDaiWidgetOpen) && (
          <DaiWidget
            isEnabled={isDaiEnabled}
            isLoading={isDaiEnabled && !dai}
            isDefaultExpanded={isDesktopLayout && themeConfig.daiConfig.defaultValue}
            opacity={daiOpacity}
            className="soilhive-map-dai"
            onToggle={() => setIsDaiEnabled(prevValue => !prevValue)}
            onOpacityChange={setDaiOpacity}
          />
        )}
        {themeConfig.daiConfig?.isEnabled && <LoadingLine isLoading={isDaiEnabled && !dai} />}
      </Map>
      {!isDesktopLayout && isAreaInfoVisible && (
        <AreaInfoBar onClose={onAreaInfoClose} locationName={selectedLocationName} selection={selection} />
      )}
    </div>
  );
}

export default SoilhiveMap;
