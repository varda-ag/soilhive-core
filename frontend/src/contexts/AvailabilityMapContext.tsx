import React, { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LngLat, MapGeoJSONFeature } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { bboxPolygon } from '@turf/turf';

import useTheme from '../hooks/useTheme';
import type { SoilhiveMapSelectionType } from '../components/Map/SoilhiveMapSelectionChangeEvent';
import { useRestoredPageState } from '../auth/signinPageState';

export type MapSelection = { type: string; features: GeoJSON.GeoJSON[] };

type SelectionType = SoilhiveMapSelectionType;

// The selection on the map, carried through an OIDC sign-in so the visitor comes back to it (docs/adr/0075).
// Left out: the H3 cell, a map feature that does not survive storage (the selection keeps its shape), and the
// point of the area card, a maplibre class this module does not load; a click in the selection reopens it.
export const AVAILABILITY_MAP_SIGNIN_STATE_KEY = 'availabilityMap';
export type AvailabilityMapSigninState = {
  selection: MapSelection;
  geometryFilter: (Polygon | MultiPolygon)[];
  boundingBox: [number, number, number, number];
  selectionType: SelectionType;
  locationName?: string;
  showSelectionToolbar: boolean;
  isDaiEnabled: boolean;
  daiOpacity: number;
};

type AvailabilityMapContextType = {
  selectedPoint: LngLat | null;
  selectedH3Cell: MapGeoJSONFeature | null;
  h3Cells: FeatureCollection | null;
  emptySelection: MapSelection;
  selection: MapSelection;
  showDrawControl: boolean;
  showSelectionToolbar: boolean;
  boundingBox: [number, number, number, number];
  geometryFilter: (Polygon | MultiPolygon)[];
  selectionType: SelectionType;
  locationName?: string;
  isDaiEnabled: boolean;
  daiOpacity: number;
  setSelectedPoint: React.Dispatch<React.SetStateAction<LngLat | null>>;
  setSelectedH3Cell: React.Dispatch<React.SetStateAction<MapGeoJSONFeature | null>>;
  setH3Cells: React.Dispatch<React.SetStateAction<FeatureCollection | null>>;
  setSelection: React.Dispatch<React.SetStateAction<MapSelection>>;
  setShowDrawControl: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSelectionToolbar: React.Dispatch<React.SetStateAction<boolean>>;
  setBoundingBox: React.Dispatch<React.SetStateAction<[number, number, number, number]>>;
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setSelectionType: React.Dispatch<React.SetStateAction<SelectionType>>;
  setLocationName: React.Dispatch<React.SetStateAction<string | undefined>>;
  setIsDaiEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setDaiOpacity: React.Dispatch<React.SetStateAction<number>>;
};

export const AvailabilityMapContext = createContext<AvailabilityMapContextType | undefined>(undefined);

const emptySelection: MapSelection = { type: 'FeatureCollection', features: [] };

type AvailabilityMapProviderProps = {
  children: ReactNode;
};

export const AvailabilityMapProvider: React.FC<AvailabilityMapProviderProps> = ({ children }) => {
  const { themeConfig, isLoadingThemeConfig } = useTheme();
  const restored = useRestoredPageState<AvailabilityMapSigninState>(AVAILABILITY_MAP_SIGNIN_STATE_KEY);

  const [selectedPoint, setSelectedPoint] = useState<LngLat | null>(null);
  const [selectedH3Cell, setSelectedH3Cell] = useState<MapGeoJSONFeature | null>(null);
  const [h3Cells, setH3Cells] = useState<FeatureCollection | null>(null);
  const [selection, setSelection] = useState<MapSelection>(restored?.selection ?? emptySelection);
  const [showDrawControl, setShowDrawControl] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(restored?.showSelectionToolbar ?? false);
  const [selectionType, setSelectionType] = useState<SelectionType>(restored?.selectionType ?? 'drawn-polygon');
  const [locationName, setLocationName] = useState<string | undefined>(restored?.locationName);
  const [boundingBox, setBoundingBox] = useState<[number, number, number, number]>(restored?.boundingBox ?? themeConfig.initialBbox);
  const [geometryFilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>(
    () => restored?.geometryFilter ?? [bboxPolygon(themeConfig.initialBbox).geometry],
  );
  const [isDaiEnabled, setIsDaiEnabled] = useState<boolean>(
    restored?.isDaiEnabled ?? (themeConfig.daiConfig?.isEnabled && themeConfig.daiConfig?.defaultValue),
  );
  const [daiOpacity, setDaiOpacity] = useState(restored?.daiOpacity ?? 80);

  // The state above is seeded from themeConfig, but themeConfig starts out as
  // defaultThemeConfig until the real config finishes loading. Since this
  // provider can now mount before that load completes, re-apply the real
  // values once, the first time loading finishes. Not over a selection a
  // sign-in brought back: it was made under the real config.
  const hasSyncedInitialConfig = useRef(!!restored);
  useEffect(() => {
    if (isLoadingThemeConfig || hasSyncedInitialConfig.current) return;
    hasSyncedInitialConfig.current = true;
    setBoundingBox(themeConfig.initialBbox);
    setGeometryFilter([bboxPolygon(themeConfig.initialBbox).geometry]);
    setIsDaiEnabled(themeConfig.daiConfig?.isEnabled && themeConfig.daiConfig?.defaultValue);
  }, [isLoadingThemeConfig, themeConfig]);

  return (
    <AvailabilityMapContext.Provider
      value={{
        selectedPoint,
        selectedH3Cell,
        h3Cells,
        emptySelection,
        selection,
        showDrawControl,
        showSelectionToolbar,
        boundingBox,
        geometryFilter,
        selectionType,
        locationName,
        isDaiEnabled,
        daiOpacity,
        setSelectedPoint,
        setSelectedH3Cell,
        setH3Cells,
        setSelection,
        setShowDrawControl,
        setShowSelectionToolbar,
        setBoundingBox,
        setGeometryFilter,
        setSelectionType,
        setLocationName,
        setIsDaiEnabled,
        setDaiOpacity,
      }}
    >
      {children}
    </AvailabilityMapContext.Provider>
  );
};
