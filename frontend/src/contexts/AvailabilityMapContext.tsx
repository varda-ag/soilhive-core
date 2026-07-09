import React, { createContext, useState, type ReactNode } from 'react';
import type { LngLat, MapGeoJSONFeature } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { bboxPolygon } from '@turf/turf';

import useTheme from '../hooks/useTheme';

export type MapSelection = { type: string; features: GeoJSON.GeoJSON[] };

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
  selectionType: 'h3-cell' | 'drawn-polygon' | 'country';
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
  setSelectionType: React.Dispatch<React.SetStateAction<'h3-cell' | 'drawn-polygon' | 'country'>>;
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
  const { themeConfig } = useTheme();

  const [selectedPoint, setSelectedPoint] = useState<LngLat | null>(null);
  const [selectedH3Cell, setSelectedH3Cell] = useState<MapGeoJSONFeature | null>(null);
  const [h3Cells, setH3Cells] = useState<FeatureCollection | null>(null);
  const [selection, setSelection] = useState<MapSelection>(emptySelection);
  const [showDrawControl, setShowDrawControl] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [selectionType, setSelectionType] = useState<'h3-cell' | 'drawn-polygon' | 'country'>('drawn-polygon');
  const [locationName, setLocationName] = useState<string>();
  const [boundingBox, setBoundingBox] = useState<[number, number, number, number]>(themeConfig.initialBbox);
  const [geometryFilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([bboxPolygon(themeConfig.initialBbox).geometry]);
  const [isDaiEnabled, setIsDaiEnabled] = useState<boolean>(themeConfig.daiConfig?.isEnabled && themeConfig.daiConfig?.defaultValue);
  const [daiOpacity, setDaiOpacity] = useState(80);

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
