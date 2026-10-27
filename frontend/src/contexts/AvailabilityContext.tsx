import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';

import type { AvailabilityDataset, DatasetFrontendFilters, DatasetSummary, TimeFilterState } from 'types/availability';
import { mapFilteredDatasetSummaryToAvailabilityDataset, mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import {
  Capability,
  EntitlementScope,
  type SoilProperty,
  type FilterCriteria,
  type SoilPropertyCategory,
  type FilteredDatasetSummary,
  type BackendStoredDataFilter,
  type RasterFilterCategory,
  type FilteredData,
  type FilteredDataset,
} from 'types/backend';
import { applyDataScopeCriteria, computeDatasetSummary, matchesDataScope, withoutDataScopeCriteria } from '../domain';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { useSoilProperties } from '../hooks/useSoilProperties';
import { usePropertiesCategories } from 'hooks/usePropertiesCategories';
import { useRaster } from 'hooks/useRaster';
import useAvailabilityMap from '../hooks/useAvailabilityMap';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { SPLIT_FILTERING_QUERIES } from 'utilities/environmentVariables';

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
  isLoadingFilterId: boolean;
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

const matchesSearch = (name: string, searchValue: string) => !searchValue || name.toLowerCase().includes(searchValue.toLowerCase());

type AvailabilityProviderProps = {
  children: ReactNode;
};

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
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

  // The full filter carries every criterion: DAI is computed server-side per H3 cell, and
  // Download/Explore links use its id. The coverage filter leaves out data_types/visibility,
  // which the coverage list applies in the browser, so changing them does not refetch coverage.
  const fullFilterPayload = useMemo(() => ({ geometries: geometryFilter, parameters: datasetFilters }), [geometryFilter, datasetFilters]);
  const coverageFilterParameters = useMemo(() => withoutDataScopeCriteria(datasetFilters), [datasetFilters]);
  const coverageFilterPayload = useMemo(
    () => ({ geometries: geometryFilter, parameters: coverageFilterParameters }),
    [geometryFilter, coverageFilterParameters],
  );

  const { filterId: fullFilterId, selectedFilters, isLoading: isLoadingFullFilter } = useDataFilterQuery(fullFilterPayload);
  const { filterId: coverageFilterId, isLoading: isLoadingCoverageFilter } = useDataFilterQuery(coverageFilterPayload);

  const { data: fullFilterResults, isLoading: isFullCoverageLoading } = useFilteredCoverageQuery(coverageFilterId);
  const { data: geometryFilterResults, isLoading: isPartialCoverageLoading } = useFilteredCoverageQuery(
    coverageFilterId,
    Object.keys(coverageFilterParameters).length > 0, // Ask for geometry only coverage if there are coverage criteria applied
  );
  const { data: fullFilterDatasets, isLoading: isFullDatasetsLoading } = useFilteredDatasetsQuery(coverageFilterId);

  const [selectedSoilProperties, setSelectedSoilProperties] = useState<string[]>([]);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilterState>({});

  const { can } = useEntitlements(EntitlementScope.DATASETS);
  const isAvailableDataset = useCallback(
    (dataset: { id: string; visibility: string }) =>
      dataset.visibility === 'public' || can(Capability.DOWNLOAD, dataset.id) || can(Capability.PREVIEW, dataset.id),
    [can],
  );

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
      setDatasetFilters(prevFilters => applyDataScopeCriteria(prevFilters, name, value));
    },
    [datasetFrontendFilters],
  );

  const scopedCoverageDatasets = useMemo(
    () => fullFilterResults?.datasets.filter(dataset => matchesDataScope(dataset.data_type, dataset.visibility, datasetFrontendFilters)),
    [fullFilterResults, datasetFrontendFilters],
  );
  const scopedListedDatasets = useMemo(
    () => fullFilterDatasets?.filter(dataset => matchesDataScope(dataset.data_type, dataset.visibility, datasetFrontendFilters)),
    [fullFilterDatasets, datasetFrontendFilters],
  );
  const scopedDatasets = scopedCoverageDatasets ?? scopedListedDatasets;

  const selectAllDatasets = useCallback(
    (select: boolean) => {
      setSelectedDatasets(select && scopedDatasets ? scopedDatasets.filter(isAvailableDataset).map(result => result.id) : []);
      setIsAllSelected(select);
    },
    [scopedDatasets, isAvailableDataset],
  );

  const allDatasets = useMemo(() => {
    if (!fullFilterResults) {
      return fullFilterDatasets?.map(mapFilteredDatasetToAvailabilityDataset) || [];
    }
    return fullFilterResults.datasets.map(mapFilteredDatasetSummaryToAvailabilityDataset);
  }, [fullFilterResults, fullFilterDatasets]);

  const datasets = useMemo(() => {
    return allDatasets
      .filter(
        dataset =>
          matchesDataScope(dataset.dataType, dataset.visibility, datasetFrontendFilters) && matchesSearch(dataset.name, searchValue),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchValue, allDatasets, datasetFrontendFilters]);

  const isDatasetsLoading = useMemo(() => {
    return isLoadingCoverageFilter || (SPLIT_FILTERING_QUERIES ? isFullDatasetsLoading : isFullCoverageLoading);
  }, [isLoadingCoverageFilter, isFullDatasetsLoading, isFullCoverageLoading]);

  const isCoverageLoading = useMemo(() => {
    return isLoadingCoverageFilter || isFullCoverageLoading || isPartialCoverageLoading;
  }, [isFullCoverageLoading, isLoadingCoverageFilter, isPartialCoverageLoading]);

  const isLoading = useMemo(() => {
    return isCoverageLoading || isLoadingSoilProperties || isLoadingCategories;
  }, [isCoverageLoading, isLoadingSoilProperties, isLoadingCategories]);

  const isNoFilteredData = useMemo(() => {
    return !!Object.keys(datasetFilters).length && scopedDatasets?.length === 0;
  }, [scopedDatasets, datasetFilters]);

  const isNoData = useMemo(() => {
    return geometryFilterResults?.datasets.length === 0;
  }, [geometryFilterResults]);

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(scopedCoverageDatasets, scopedListedDatasets);
  }, [scopedCoverageDatasets, scopedListedDatasets]);

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
    const allowedDatasets = (scopedDatasets ?? []).filter(
      dataset => isAvailableDataset(dataset) && matchesSearch(dataset.name, searchValue),
    );
    if (selectedDatasets.length > 0) {
      const datasetIds = new Set(allowedDatasets.map(dataset => dataset.id));
      // Excludes the selected datasets that are not available anymore in the current
      // map view/selection, or are hidden by the search
      const validSelectedDatasets = new Set(selectedDatasets.filter(id => datasetIds.has(id)));
      if (validSelectedDatasets.size > 0) {
        return allowedDatasets.filter(dataset => validSelectedDatasets.has(dataset.id));
      }
    }
    return allowedDatasets.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [scopedDatasets, selectedDatasets, isAvailableDataset, searchValue]);

  return (
    <AvailabilityContext.Provider
      value={{
        allSoilProperties: allSoilProperties || [],
        filteredSoilProperties,
        allRasterCategories: allRasterCategories || [],
        isLoadingSoilProperties,
        categories: categories || [],
        allDatasets,
        filteredDatasets: scopedCoverageDatasets ?? [],
        geometryFilterResults,
        datasets,
        selectedDatasets,
        isAllSelected,
        isNoData,
        isNoFilteredData,
        isLoading,
        isDatasetsLoading,
        isCoverageLoading,
        isLoadingPartialFilter: isLoadingCoverageFilter,
        isLoadingRasterCategories,
        searchValue,
        datasetFrontendFilters,
        datasetsSummary,
        datasetFilters,
        selectedTimeFilter,
        appliedFiltersCount,
        filterId: fullFilterId,
        isLoadingFilterId: isLoadingFullFilter,
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
