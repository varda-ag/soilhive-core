import { useFilteredDatasets } from 'hooks/useFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';
import type { AvailabilityDataset, DatasetFrontendFilters, DatasetSummary, TimeFilterState } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { SoilProperty, FilterCriteria, SoilPropertyCategory, FilteredDataset, BackendStoredDataFilter } from 'types/backend';
import { computeDatasetSummary } from '../domain';
import type { MultiPolygon, Polygon } from 'geojson';
import { useSoilProperties } from '../hooks/useSoilProperties';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';

type AvailabilityContextType = {
  allSoilProperties: SoilProperty[];
  filteredSoilProperties: SoilProperty[];
  categories: SoilPropertyCategory[];
  isLoadingSoilProperties: boolean;
  allDatasets: AvailabilityDataset[];
  filteredDatasets: FilteredDataset[];
  datasets: AvailabilityDataset[];
  selectedDatasets: string[];
  isAllSelected: boolean;
  isNoData: boolean;
  isNoFilteredData: boolean;
  isLoading: boolean;
  searchValue: string;
  datasetFrontendFilters: DatasetFrontendFilters;
  selectedTimeFilter: TimeFilterState;
  datasetsSummary: DatasetSummary;
  datasetFilters: FilterCriteria;
  preview: boolean;
  appliedFiltersCount: number;
  filterId: string | undefined;
  selectedFilters: BackendStoredDataFilter | undefined;
  isFiltersSelected: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFrontendFilters: (value: string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  geometryFilter: (Polygon | MultiPolygon)[];
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterCriteria>>;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSoilProperties: string[];
  setSelectedSoilProperties: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedTimeFilter: React.Dispatch<React.SetStateAction<TimeFilterState>>;
  clearAllFilters: () => void;
  selectionType: 'h3-cell' | 'drawn-polygon' | 'country';
  setSelectionType: React.Dispatch<React.SetStateAction<'h3-cell' | 'drawn-polygon' | 'country'>>;
  locationName?: string;
  setLocationName: React.Dispatch<React.SetStateAction<string | undefined>>;
  boundingBox?: [number, number, number, number];
  setBoundingBox: React.Dispatch<React.SetStateAction<[number, number, number, number] | undefined>>;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const [selectionType, setSelectionType] = useState<'h3-cell' | 'drawn-polygon' | 'country'>('drawn-polygon');
  const [locationName, setLocationName] = useState<string>();
  const [boundingBox, setBoundingBox] = useState<[number, number, number, number]>();
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [datasetFrontendFilters, setDatasetFrontendFilters] = useState<DatasetFrontendFilters>({
    type: [],
    ownership: [],
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);
  const [preview, setPreview] = useState<boolean>(false);
  const [geometryFilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([]);
  const [datasetFilters, setDatasetFilters] = useState<FilterCriteria>({});
  const { data: categories, isLoading: isLoadingCategories } = usePropertiesCategories();
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const partialFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: {} }), [geometryFilter]);
  const fullFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: datasetFilters }), [geometryFilter, datasetFilters]);

  const { data: geometryFilterResults, isLoading: isLoadingPartialFilter } = useFilteredDatasets(partialFilterPayload);
  const { filterId, selectedFilters, data: fullFilterResults, isLoading: isLoadingFullFilter } = useFilteredDatasets(fullFilterPayload);

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
      setSelectedDatasets(select && fullFilterResults ? fullFilterResults?.map(result => result.id) : []);
      setIsAllSelected(select);
    },
    [fullFilterResults],
  );

  const allDatasets = useMemo(() => {
    if (!fullFilterResults) return [];
    return fullFilterResults.map(mapFilteredDatasetToAvailabilityDataset);
  }, [fullFilterResults]);

  const datasets = useMemo(() => {
    return allDatasets.filter(dataset => {
      return (
        (!dataset.dataType || !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.dataType)) &&
        (!searchValue || dataset.name.toLowerCase().includes(searchValue.toLowerCase()))
      );
    });
  }, [searchValue, allDatasets, datasetFrontendFilters]);

  const isLoading = useMemo(() => {
    return isLoadingPartialFilter || isLoadingFullFilter || isLoadingSoilProperties || isLoadingCategories;
  }, [isLoadingFullFilter, isLoadingPartialFilter, isLoadingSoilProperties, isLoadingCategories]);

  const isNoFilteredData = useMemo(() => {
    return fullFilterResults?.length === 0;
  }, [fullFilterResults]);

  const isNoData = useMemo(() => {
    return geometryFilterResults?.length === 0;
  }, [geometryFilterResults]);

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(fullFilterResults);
  }, [fullFilterResults]);

  const filteredSoilProperties = useMemo<SoilProperty[]>(() => {
    const properties = new Set<string>();
    geometryFilterResults
      ?.filter(dataset => !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.data_type as string))
      .forEach(dataset => dataset.soil_properties?.forEach(prop => properties.add(prop)));
    return allSoilProperties?.filter(prop => properties.has(prop.id)) ?? [];
  }, [allSoilProperties, geometryFilterResults, datasetFrontendFilters]);

  const appliedFiltersCount = useMemo<number>(() => {
    return (
      (datasetFilters.soil_properties?.length || 0) +
      (datasetFilters.min_sampling_date && datasetFilters.max_sampling_date ? 1 : 0) +
      datasetFrontendFilters.type.length +
      datasetFrontendFilters.ownership.length
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
      selectedSoilProperties.length
    );
  }, [datasetFrontendFilters, selectedTimeFilter, selectedSoilProperties]);

  return (
    <AvailabilityContext.Provider
      value={{
        allSoilProperties: allSoilProperties || [],
        filteredSoilProperties,
        isLoadingSoilProperties,
        categories: categories || [],
        allDatasets,
        filteredDatasets: fullFilterResults ?? [],
        datasets,
        selectedDatasets,
        isAllSelected,
        isNoData,
        isNoFilteredData,
        isLoading,
        searchValue,
        datasetFrontendFilters,
        datasetsSummary,
        datasetFilters,
        selectedTimeFilter,
        preview,
        appliedFiltersCount,
        filterId,
        selectedFilters,
        isFiltersSelected,
        selectDataset,
        setSearchValue,
        setFrontendFilters,
        selectAllDatasets,
        setDatasetFilters,
        setPreview,
        geometryFilter,
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
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
