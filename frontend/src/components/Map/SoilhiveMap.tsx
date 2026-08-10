import { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle, type ReactNode } from 'react';
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
import type { Polygon, MultiPolygon, Point, FeatureCollection } from 'geojson';
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
import type { DataAvailabilityIndex } from '../../types/backend';
import { DaiWidget } from './DaiWidget/DaiWidget';
import LayersIcon from 'assets/icons/layers-icon.svg?react';
import type { MapStyles } from 'types/components';
import { MapStyleSwitcher } from './MapStyleSwitcher/MapStyleSwitcher';
import LoadingLine from './LoadingLine/LoadingLine';

/**
 * Kept structurally identical to (but independent of) AvailabilityMapContext's own MapSelection —
 * this component must not import from `contexts/` so it can be vendored into plugins standalone.
 */
export type MapSelection = { type: string; features: GeoJSON.GeoJSON[] };

/**
 * Selection/draw state — previously read from AvailabilityMapContext, now fully controlled so this
 * component has no import-time dependency on any host context (required to be vendorable into a
 * plugin, which isn't a descendant of AvailabilityMapProvider). Shaped identically to
 * AvailabilityMapContext's own relevant fields, so the host can pass `useAvailabilityMap()`'s
 * return value straight through without repackaging it.
 */
export interface SoilhiveMapSelectionState {
  selectedPoint: LngLat | null;
  setSelectedPoint: React.Dispatch<React.SetStateAction<LngLat | null>>;
  selectedH3Cell: MapGeoJSONFeature | null;
  setSelectedH3Cell: React.Dispatch<React.SetStateAction<MapGeoJSONFeature | null>>;
  h3Cells: FeatureCollection | null;
  setH3Cells: React.Dispatch<React.SetStateAction<FeatureCollection | null>>;
  selection: MapSelection;
  setSelection: React.Dispatch<React.SetStateAction<MapSelection>>;
  showDrawControl: boolean;
  setShowDrawControl: React.Dispatch<React.SetStateAction<boolean>>;
  showSelectionToolbar: boolean;
  setShowSelectionToolbar: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * DAI overlay — entirely optional as a whole. Omitting this prop (the plugin scenario) renders no
 * DAI UI and triggers no DAI network activity, since the query itself now lives on the host (see
 * useDai's dependency on the host-only useApiQuery/useAvailability).
 */
export interface SoilhiveMapDaiProps {
  data?: DataAvailabilityIndex;
  isLoading?: boolean;
  isEnabled?: boolean;
  opacity?: number;
  showWidget?: boolean;
  isWidgetDefaultExpanded?: boolean;
  onToggle?: () => void;
  onOpacityChange?: (value: number) => void;
  /** Reports the current viewport's bbox/H3 resolution so the host can drive its own DAI query. */
  onViewportChange?: (params: { bbox: [number, number, number, number]; resolution: number } | null) => void;
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
  /**
   * Optional — shows an "Upload a polygon" option in the toolbar's dropdown when provided. This
   * component no longer owns any upload-via-modal UI itself (UploadPolygonModal pulls in Dialog ->
   * primereact, which isn't vendored to plugins); the caller decides what happens on click, e.g.
   * opening its own modal and eventually calling this ref's own `onUpload`. Uploading via
   * drag-and-drop (through the ref) is unaffected either way.
   */
  onUploadClick?: () => void;

  selectionState: SoilhiveMapSelectionState;
  dai?: SoilhiveMapDaiProps;

  /**
   * Rendered inside the underlying <Map>, the same way MapStyleSwitcher/DaiWidget already are —
   * lets a consumer (host or plugin) layer its own overlays (e.g. a selection info card) on top
   * of the map. react-map-gl primitives (Popup, Marker, Source, Layer) must be real descendants
   * of <Map> to access its context, so this is the only way to add one from outside.
   */
  children?: ReactNode;

  /**
   * Rendered as a flex sibling of <Map>, inside the outer .soilhive-map wrapper (which is
   * `display: flex; flex-direction: column`) — for content that must stack *below* the map rather
   * than overlay it, and that doesn't need react-map-gl's context (e.g. a mobile info bar). Using
   * `children` for this instead would nest it inside <Map>'s own DOM and break that layout.
   */
  footer?: ReactNode;
}

export interface SoilhiveMapRef {
  onUpload: (geometry: Polygon | MultiPolygon) => void;
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

const emptySelection: MapSelection = { type: 'FeatureCollection', features: [] };

// How long the ScaleControl stays visible after zooming stops before it starts fading out
const SCALE_LINGER_MS = 1000;
// How long the ScaleControl's fade-out transition takes
const SCALE_FADE_MS = 300;

const SoilhiveMap = forwardRef<SoilhiveMapRef, SoilhiveMapProps>(function SoilhiveMap(
  {
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
    onUploadClick,
    selectionState,
    dai: daiProps,
    children,
    footer,
  },
  ref,
) {
  const { t } = useTranslation('availability');

  // selectedPoint itself is intentionally not read here — SoilhiveMap only ever *writes* it via
  // setSelectedPoint; the value is for whoever renders this component (host or plugin) to read
  // back, e.g. to decide what to show via `children`.
  const {
    setSelectedPoint,
    selectedH3Cell,
    setSelectedH3Cell,
    h3Cells,
    setH3Cells,
    selection,
    setSelection,
    showDrawControl,
    setShowDrawControl,
    showSelectionToolbar,
    setShowSelectionToolbar,
  } = selectionState;

  const {
    data: dai,
    isLoading: isDaiLoading,
    isEnabled: isDaiEnabled,
    opacity: daiOpacity,
    showWidget: showDaiWidget,
    isWidgetDefaultExpanded: isDaiWidgetDefaultExpanded,
    onToggle: onDaiToggle,
    onOpacityChange: onDaiOpacityChange,
    onViewportChange,
  } = daiProps ?? {};

  const mapRef = useRef<any>(null);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [currentMapStyleIndex, setCurrentMapStyleIndex] = useState<number>(0);
  const [isScaleMounted, setIsScaleMounted] = useState(false);
  const [isScaleVisible, setIsScaleVisible] = useState(false);
  const scaleHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleUnmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          ['*', (daiOpacity ?? 0) / 100, ['interpolate', ['linear'], ['get', 'dai'], 0, 0.0, 0.01, 0.1, 0.5, 0.25, 1.0, 0.75]],
          0,
        ],
        'fill-color': ['interpolate', ['linear'], ['get', 'dai'], 0, '#ffffcc', 0.5, '#fd8d3c', 1.0, '#800026'],
      },
    }),
    [daiOpacity],
  );
  const [viewportParams, setViewportParams] = useState<{ bbox: [number, number, number, number]; resolution: number } | null>(null);
  const [isPointResultSelection, setIsPointResultSelection] = useState(false);

  useEffect(() => {
    if (!viewportParams || !showH3Cells || (isDaiEnabled && !dai)) return;
    try {
      const h3Indexes = bBoxToH3Cells(viewportParams.bbox, viewportParams.resolution);
      const h3CellsFeatureCollection =
        isDaiEnabled && dai ? dataAvailabilityIndexToGeoJSONPolygons(dai) : h3IndexesToGeoJSONPolygons(h3Indexes);
      setH3Cells(h3CellsFeatureCollection);
    } catch (error) {
      console.error('Error while updating the H3 Cells:', error);
    }
  }, [dai, viewportParams, showH3Cells, setH3Cells, isDaiEnabled]);

  const { isMobileLayout, isDesktopLayout } = useDevice();

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

  useImperativeHandle(ref, () => ({ onUpload }), [onUpload]);

  const updateH3Cells = useCallback(
    ({ bounds, zoomLevel }: { bounds: number[]; zoomLevel: number }) => {
      if (!showH3Cells) {
        setH3Cells(null);
        setViewportParams(null);
        onViewportChange?.(null);
        return;
      }
      const params = { bbox: bounds as [number, number, number, number], resolution: h3ResolutionForZoomLevel(zoomLevel) };
      setViewportParams(params);
      onViewportChange?.(params);
    },
    [showH3Cells, setH3Cells, onViewportChange],
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
    setShowDrawControl(false);
    setShowSelectionToolbar(false);
    onSelectionToolbarVisibilityChange?.(false);
    onSelectionChange?.({
      bounds: mapRef.current.getMap().getBounds().toArray().flat(),
      selectionType: selectionTypeRef.current,
    });
  }, [
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
    >
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
        <SoilhiveMapToolbar visible={!showDrawControl} onDrawClick={onDrawClick} onUploadClick={onUploadClick} />

        {showSelectionToolbar && <SoilhiveMapSelectionToolbar mode={toolbarMode} onCancel={resetSelection} onReset={resetDrawing} />}

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
        {showDaiWidget && !isDesktopLayout && (
          <button className="soilhive-map-dai-btn" onClick={() => setIsDaiWidgetOpen(v => !v)} aria-label={t('dai_widget.toggle_aria')}>
            <LayersIcon />
          </button>
        )}
        {showDaiWidget && (isDesktopLayout || isDaiWidgetOpen) && (
          <DaiWidget
            isEnabled={!!isDaiEnabled}
            isLoading={!!isDaiEnabled && !dai}
            isDefaultExpanded={isDesktopLayout && !!isDaiWidgetDefaultExpanded}
            opacity={daiOpacity ?? 0}
            className="soilhive-map-dai"
            onToggle={() => onDaiToggle?.()}
            onOpacityChange={value => onDaiOpacityChange?.(value)}
          />
        )}
        {showDaiWidget && <LoadingLine isLoading={!!isDaiEnabled && !dai} />}
        {children}
      </Map>
      {footer}
    </div>
  );
});

export default SoilhiveMap;
