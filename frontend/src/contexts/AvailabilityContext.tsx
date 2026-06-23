import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';

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
  FilteredDataset,
} from 'types/backend';
import { computeDatasetSummary } from '../domain';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { useSoilProperties } from '../hooks/useSoilProperties';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';
import { useRaster } from 'hooks/useRaster';
import useAvailabilityMap from '../hooks/useAvailabilityMap';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';
import { useAuthContext } from '../auth/AuthContextProvider';

type AvailabilityContextType = {
  allSoilProperties: SoilProperty[];
  filteredSoilProperties: SoilProperty[];
  allRasterCategories: RasterFilterCategory[];
  categories: SoilPropertyCategory[];
  isLoadingSoilProperties: boolean;
  allDatasets: AvailabilityDataset[];
  filteredDatasets: FilteredDatasetSummary[];
  availableDatasets: (FilteredDatasetSummary | FilteredDataset)[];
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
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterCriteria>>;
  selectedSoilProperties: string[];
  setSelectedSoilProperties: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedTimeFilter: React.Dispatch<React.SetStateAction<TimeFilterState>>;
  clearAllFilters: () => void;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const { geometryFilter } = useAvailabilityMap();
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [datasetFrontendFilters, setDatasetFrontendFilters] = useState<DatasetFrontendFilters>({
    type: [],
    visibility: [],
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);

  const [datasetFilters, setDatasetFilters] = useState<FilterCriteria>({});
  const { data: categories, isLoading: isLoadingCategories } = usePropertiesCategories();
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();
  const { allCategories: allRasterCategories, isLoading: isLoadingRasterCategories } = useRaster();

  const fullFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: datasetFilters }), [geometryFilter, datasetFilters]);

  const { filterId: fullFilterId, selectedFilters, isLoading: isLoadingFullFilter } = useDataFilterQuery(fullFilterPayload);

  const { data: fullFilterResults, isLoading: isFullCoverageLoading } = useFilteredCoverageQuery(fullFilterId);
  const { data: geometryFilterResults, isLoading: isPartialCoverageLoading } = useFilteredCoverageQuery(
    fullFilterId,
    Object.keys(fullFilterPayload.parameters).length > 0, // Ask for geometry only coverage if there are frontend filters applied
  );
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
      const datasets = fullFilterResults?.datasets || fullFilterDatasets;
      setSelectedDatasets(
        select && datasets
          ? datasets
              .filter(dataset => {
                return isAuthenticated || dataset.visibility === 'public';
              })
              .map(result => result.id)
          : [],
      );
      setIsAllSelected(select);
    },
    [fullFilterResults, fullFilterDatasets, isAuthenticated],
  );

  const allDatasets = useMemo(() => {
    if (!fullFilterResults) {
      return fullFilterDatasets?.map(mapFilteredDatasetToAvailabilityDataset) || [];
    }
    return fullFilterResults.datasets.map(mapFilteredDatasetSummaryToAvailabilityDataset);
  }, [fullFilterResults, fullFilterDatasets]);

  const datasets = useMemo(() => {
    return allDatasets
      .filter(dataset => {
        return (
          (!dataset.dataType || !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.dataType)) &&
          (!dataset.visibility ||
            !datasetFrontendFilters.visibility.length ||
            datasetFrontendFilters.visibility.includes(dataset.visibility)) &&
          (!searchValue || dataset.name.toLowerCase().includes(searchValue.toLowerCase()))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchValue, allDatasets, datasetFrontendFilters]);

  const isDatasetsLoading = useMemo(() => {
    return isFullDatasetsLoading || isLoadingFullFilter;
  }, [isLoadingFullFilter, isFullDatasetsLoading]);

  const isCoverageLoading = useMemo(() => {
    return isLoadingFullFilter || isFullCoverageLoading || isPartialCoverageLoading;
  }, [isFullCoverageLoading, isLoadingFullFilter, isPartialCoverageLoading]);

  const isLoading = useMemo(() => {
    return isCoverageLoading || isLoadingSoilProperties || isLoadingCategories;
  }, [isCoverageLoading, isLoadingSoilProperties, isLoadingCategories]);

  const isNoFilteredData = useMemo(() => {
    return !!Object.keys(datasetFilters).length && fullFilterDatasets?.length === 0;
  }, [fullFilterDatasets, datasetFilters]);

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
      datasetFrontendFilters.visibility.length +
      (datasetFilters.raster_filters
        ? Object.values(datasetFilters.raster_filters).reduce((count, filters) => count + filters.length, 0)
        : 0)
    );
  }, [datasetFilters, datasetFrontendFilters]);

  const clearAllFilters = useCallback(() => {
    setDatasetFrontendFilters({
      type: [],
      visibility: [],
    });
    setDatasetFilters({});
    setSelectedSoilProperties([]);
    setSelectedTimeFilter({});
  }, []);

  const isFiltersSelected = useMemo((): boolean => {
    return !!(
      datasetFrontendFilters.type.length ||
      datasetFrontendFilters.visibility.length ||
      selectedTimeFilter.min ||
      selectedTimeFilter.max ||
      selectedSoilProperties.length ||
      Object.keys(datasetFilters.raster_filters ?? {}).length
    );
  }, [datasetFrontendFilters, selectedTimeFilter, selectedSoilProperties, datasetFilters.raster_filters]);

  const availableDatasets = useMemo(() => {
    const datasets = fullFilterResults ? fullFilterResults.datasets : fullFilterDatasets || [];
    const allowedDatasets = isAuthenticated ? datasets : datasets.filter(dataset => dataset.visibility === 'public');
    if (selectedDatasets.length > 0) {
      const datasetIds = new Set(allowedDatasets.map(dataset => dataset.id));
      // Excludes the selected datasets that are not available anymore in the current
      // map view/selection
      const validSelectedDatasets = new Set(selectedDatasets.filter(id => datasetIds.has(id)));
      if (validSelectedDatasets.size > 0) {
        return allowedDatasets.filter(dataset => validSelectedDatasets.has(dataset.id));
      }
    }
    return allowedDatasets.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [fullFilterResults, fullFilterDatasets, isAuthenticated, selectedDatasets]);

  return (
    <AvailabilityContext.Provider
      value={{
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
        isLoadingPartialFilter: isLoadingFullFilter,
        isLoadingRasterCategories,
        searchValue,
        datasetFrontendFilters,
        datasetsSummary,
        datasetFilters,
        selectedTimeFilter,
        appliedFiltersCount,
        filterId: fullFilterId,
        selectedFilters,
        isFiltersSelected,
        selectDataset,
        setSearchValue,
        setFrontendFilters,
        selectAllDatasets,
        setDatasetFilters,
        selectedSoilProperties,
        setSelectedTimeFilter,
        setSelectedSoilProperties,
        clearAllFilters,
        availableDatasets,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
