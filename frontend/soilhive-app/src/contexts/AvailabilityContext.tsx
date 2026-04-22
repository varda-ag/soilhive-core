import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';
import type { LngLat, MapGeoJSONFeature } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import type { AvailabilityDataset, DatasetFrontendFilters, DatasetSummary, TimeFilterState } from 'types/availability';
import { mapFilteredDatasetSummaryToAvailabilityDataset, mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type {
  SoilProperty,
  FilterCriteria,
  SoilPropertyCategory,
  FilteredDatasetSummary,
  BackendStoredDataFilter,
  RasterFilterCategory,
  FilteredData,
} from 'types/backend';
import { computeDatasetSummary } from '../domain';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { useSoilProperties } from '../hooks/useSoilProperties';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';
import { useRaster } from 'hooks/useRaster';
import useTheme from '../hooks/useTheme';
import { bboxPolygon } from '@turf/turf';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';

type MapSelection = { type: string; features: GeoJSON.GeoJSON[] };

type AvailabilityContextType = {
  selectedPoint: LngLat | null;
  selectedH3Cell: MapGeoJSONFeature | null;
  h3Cells: FeatureCollection | null;
  emptySelection: MapSelection;
  selection: MapSelection;
  showDrawControl: boolean;
  showSelectionToolbar: boolean;
  allSoilProperties: SoilProperty[];
  filteredSoilProperties: SoilProperty[];
  allRasterCategories: RasterFilterCategory[];
  categories: SoilPropertyCategory[];
  isLoadingSoilProperties: boolean;
  allDatasets: AvailabilityDataset[];
  filteredDatasets: FilteredDatasetSummary[];
  availableDatasets: FilteredDatasetSummary[];
  geometryFilterResults: FilteredData | undefined;
  datasets: AvailabilityDataset[];
  selectedDatasets: string[];
  isAllSelected: boolean;
  isNoData: boolean;
  isNoFilteredData: boolean;
  isLoading: boolean;
  isDatasetsLoading: boolean;
  isCoverageLoading: boolean;
  isLoadingPartialFilter: boolean;
  isLoadingRasterCategories: boolean;
  searchValue: string;
  datasetFrontendFilters: DatasetFrontendFilters;
  selectedTimeFilter: TimeFilterState;
  datasetsSummary: DatasetSummary;
  datasetFilters: FilterCriteria;
  appliedFiltersCount: number;
  filterId: string | undefined;
  selectedFilters: BackendStoredDataFilter | undefined;
  isFiltersSelected: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFrontendFilters: (value: string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  geometryFilter: (Polygon | MultiPolygon)[];
  setSelectedPoint: React.Dispatch<React.SetStateAction<LngLat | null>>;
  setSelectedH3Cell: React.Dispatch<React.SetStateAction<MapGeoJSONFeature | null>>;
  setH3Cells: React.Dispatch<React.SetStateAction<FeatureCollection | null>>;
  setSelection: React.Dispatch<React.SetStateAction<MapSelection>>;
  setShowDrawControl: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSelectionToolbar: React.Dispatch<React.SetStateAction<boolean>>;
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterCriteria>>;
  selectedSoilProperties: string[];
  setSelectedSoilProperties: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedTimeFilter: React.Dispatch<React.SetStateAction<TimeFilterState>>;
  clearAllFilters: () => void;
  selectionType: 'h3-cell' | 'drawn-polygon' | 'country';
  setSelectionType: React.Dispatch<React.SetStateAction<'h3-cell' | 'drawn-polygon' | 'country'>>;
  locationName?: string;
  setLocationName: React.Dispatch<React.SetStateAction<string | undefined>>;
  boundingBox: [number, number, number, number];
  setBoundingBox: React.Dispatch<React.SetStateAction<[number, number, number, number]>>;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

const emptySelection: MapSelection = { type: 'FeatureCollection', features: [] };

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const { themeConfig } = useTheme();
  const [selectionType, setSelectionType] = useState<'h3-cell' | 'drawn-polygon' | 'country'>('drawn-polygon');
  const [locationName, setLocationName] = useState<string>();
  const [boundingBox, setBoundingBox] = useState<[number, number, number, number]>(themeConfig.initialBbox);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [datasetFrontendFilters, setDatasetFrontendFilters] = useState<DatasetFrontendFilters>({
    type: [],
    ownership: [],
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);

  const [selectedPoint, setSelectedPoint] = useState<LngLat | null>(null);
  const [selectedH3Cell, setSelectedH3Cell] = useState<MapGeoJSONFeature | null>(null);
  const [h3Cells, setH3Cells] = useState<FeatureCollection | null>(null);
  const [selection, setSelection] = useState<MapSelection>(emptySelection);
  const [showDrawControl, setShowDrawControl] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);

  const [geometryFilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([bboxPolygon(boundingBox).geometry]);
  const [datasetFilters, setDatasetFilters] = useState<FilterCriteria>({});
  const { data: categories, isLoading: isLoadingCategories } = usePropertiesCategories();
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();
  const { allCategories: allRasterCategories, isLoading: isLoadingRasterCategories } = useRaster();

  const partialFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: {} }), [geometryFilter]);
  const fullFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: datasetFilters }), [geometryFilter, datasetFilters]);

  const { filterId: partialFilterId, selectedFilters, isLoading: isLoadingPartialFilter } = useDataFilterQuery(partialFilterPayload);
  const { filterId: fullFilterId, isLoading: isLoadingFullFilter } = useDataFilterQuery(fullFilterPayload);

  const { data: fullFilterResults, isLoading: isFullCoverageLoading } = useFilteredCoverageQuery(fullFilterId);
  const { data: geometryFilterResults, isLoading: isPartialCoverageLoading } = useFilteredCoverageQuery(partialFilterId);
  const { data: fullFilterDatasets, isLoading: isFullDatasetsLoading } = useFilteredDatasetsQuery(fullFilterId);

  const [selectedSoilProperties, setSelectedSoilProperties] = useState<string[]>([]);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilterState>({});

  const selectDataset = useCallback(
    (id: string) => {
      const newValue = selectedDatasets.includes(id) ? selectedDatasets.filter(selectedId => selectedId !== id) : [...selectedDatasets, id];

      setSelectedDatasets(newValue);
      setIsAllSelected(false);
    },
    [selectedDatasets],
  );

  const setFrontendFilters = useCallback(
    (value: string[], name?: string) => {
      if (!name) return;

      setDatasetFrontendFilters({
        ...datasetFrontendFilters,
        [name]: value,
      });
    },
    [datasetFrontendFilters],
  );

  const selectAllDatasets = useCallback(
    (select: boolean) => {
      setSelectedDatasets(select && fullFilterResults ? fullFilterResults?.datasets.map(result => result.id) : []);
      setIsAllSelected(select);
    },
    [fullFilterResults],
  );

  const allDatasets = useMemo(() => {
    if (!fullFilterResults) {
      return fullFilterDatasets?.map(mapFilteredDatasetToAvailabilityDataset) || [];
    }
    if (!fullFilterResults && !fullFilterDatasets) return [];
    return fullFilterResults.datasets.map(mapFilteredDatasetSummaryToAvailabilityDataset);
  }, [fullFilterResults, fullFilterDatasets]);

  const datasets = useMemo(() => {
    return allDatasets
      .filter(dataset => {
        return (
          (!dataset.dataType || !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.dataType)) &&
          (!searchValue || dataset.name.toLowerCase().includes(searchValue.toLowerCase()))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchValue, allDatasets, datasetFrontendFilters]);

  const isDatasetsLoading = useMemo(() => {
    return isFullDatasetsLoading || isLoadingFullFilter;
  }, [isLoadingFullFilter, isFullDatasetsLoading]);

  const isCoverageLoading = useMemo(() => {
    return isLoadingFullFilter || isLoadingPartialFilter || isFullCoverageLoading || isPartialCoverageLoading;
  }, [isFullCoverageLoading, isLoadingFullFilter, isLoadingPartialFilter, isPartialCoverageLoading]);

  const isLoading = useMemo(() => {
    return isCoverageLoading || isLoadingSoilProperties || isLoadingCategories;
  }, [isCoverageLoading, isLoadingSoilProperties, isLoadingCategories]);

  const isNoFilteredData = useMemo(() => {
    return fullFilterDatasets?.length === 0;
  }, [fullFilterDatasets]);

  const isNoData = useMemo(() => {
    return geometryFilterResults?.datasets.length === 0;
  }, [geometryFilterResults]);

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(fullFilterResults?.datasets, fullFilterDatasets);
  }, [fullFilterResults, fullFilterDatasets]);

  const filteredSoilProperties = useMemo<SoilProperty[]>(() => {
    const properties = new Set<string>();
    geometryFilterResults?.datasets
      .filter(dataset => !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.data_type as string))
      .forEach(dataset => dataset.soil_properties?.forEach(prop => properties.add(prop)));
    return allSoilProperties?.filter(prop => properties.has(prop.id)) ?? [];
  }, [allSoilProperties, geometryFilterResults, datasetFrontendFilters]);

  const appliedFiltersCount = useMemo<number>(() => {
    return (
      (datasetFilters.soil_properties?.length || 0) +
      (datasetFilters.min_sampling_date && datasetFilters.max_sampling_date ? 1 : 0) +
      datasetFrontendFilters.type.length +
      datasetFrontendFilters.ownership.length +
      (datasetFilters.raster_filters
        ? Object.values(datasetFilters.raster_filters).reduce((count, filters) => count + filters.length, 0)
        : 0)
    );
  }, [datasetFilters, datasetFrontendFilters]);

  const clearAllFilters = useCallback(() => {
    setDatasetFrontendFilters({
      type: [],
      ownership: [],
    });
    setDatasetFilters({});
    setSelectedSoilProperties([]);
    setSelectedTimeFilter({});
  }, []);

  const isFiltersSelected = useMemo((): boolean => {
    return !!(
      datasetFrontendFilters.type.length ||
      datasetFrontendFilters.ownership.length ||
      selectedTimeFilter.min ||
      selectedTimeFilter.max ||
      selectedSoilProperties.length ||
      Object.keys(datasetFilters.raster_filters ?? {}).length
    );
  }, [datasetFrontendFilters, selectedTimeFilter, selectedSoilProperties, datasetFilters.raster_filters]);

  const availableDatasets = useMemo(() => {
    const datasets = fullFilterResults ? fullFilterResults.datasets : [];
    if (selectedDatasets.length > 0) {
      const datasetIds = new Set(datasets.map(dataset => dataset.id));
      // Excludes the selected datasets that are not available anymore in the current
      // map view/selection
      const validSelectedDatasets = new Set(selectedDatasets.filter(id => datasetIds.has(id)));
      if (validSelectedDatasets.size > 0) {
        return datasets.filter(dataset => validSelectedDatasets.has(dataset.id));
      }
    }
    return datasets.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [fullFilterResults, selectedDatasets]);

  return (
    <AvailabilityContext.Provider
      value={{
        selectedPoint,
        selectedH3Cell,
        h3Cells,
        emptySelection,
        selection,
        showDrawControl,
        showSelectionToolbar,
        allSoilProperties: allSoilProperties || [],
        filteredSoilProperties,
        allRasterCategories: allRasterCategories || [],
        isLoadingSoilProperties,
        categories: categories || [],
        allDatasets,
        filteredDatasets: fullFilterResults ? fullFilterResults.datasets : [],
        geometryFilterResults,
        datasets,
        selectedDatasets,
        isAllSelected,
        isNoData,
        isNoFilteredData,
        isLoading,
        isDatasetsLoading,
        isCoverageLoading,
        isLoadingPartialFilter,
        isLoadingRasterCategories,
        searchValue,
        datasetFrontendFilters,
        datasetsSummary,
        datasetFilters,
        selectedTimeFilter,
        appliedFiltersCount,
        filterId: partialFilterId,
        selectedFilters,
        isFiltersSelected,
        selectDataset,
        setSearchValue,
        setFrontendFilters,
        selectAllDatasets,
        setDatasetFilters,
        geometryFilter,
        setSelectedPoint,
        setSelectedH3Cell,
        setH3Cells,
        setSelection,
        setShowDrawControl,
        setShowSelectionToolbar,
        setGeometryFilter,
        selectedSoilProperties,
        setSelectedTimeFilter,
        setSelectedSoilProperties,
        clearAllFilters,
        selectionType,
        setSelectionType,
        locationName,
        setLocationName,
        boundingBox,
        setBoundingBox,
        availableDatasets,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
