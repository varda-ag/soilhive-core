import { useFilteredDatasets } from 'hooks/useFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';
import type { AvailabilityDataset, DatasetSummary } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { SoilProperty, FilterCriteria } from 'types/backend';
import { computeDatasetSummary } from '../domain';
import type { MultiPolygon, Polygon } from 'geojson';
import { useSoilProperties } from '../hooks/useSoilProperties';

type DatasetFrontendFilters = {
  type: string[];
  ownership: string[];
};

type TimeFilterRange = {
  min: number;
  max: number;
};

type AvailabilityContextType = {
  allSoilProperties: SoilProperty[];
  filteredSoilProperties: SoilProperty[];
  isLoadingSoilProperties: boolean;
  datasets: AvailabilityDataset[];
  selectedDatasets: string[];
  isAllSelected: boolean;
  isNoData: boolean;
  isNoFilteredData: boolean;
  isLoading: boolean;
  searchValue: string;
  datasetFrontendFilters: DatasetFrontendFilters;
  datasetsSummary: DatasetSummary;
  datasetFilters: FilterCriteria;
  timeFilterRange: TimeFilterRange;
  typeFilterOptions: string[];
  preview: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFrontendFilters: (value: string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterCriteria>>;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSoilProperties: string[];
  setSelectedSoilProperties: React.Dispatch<React.SetStateAction<string[]>>;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [datasetFrontendFilters, setDatasetFrontendFilters] = useState<DatasetFrontendFilters>({
    type: [],
    ownership: [],
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);
  const [preview, setPreview] = useState<boolean>(false);
  const [geometryfilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([]);
  const [datasetFilters, setDatasetFilters] = useState<FilterCriteria>({});
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const partialFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: {} }), [geometryfilter]);
  const fullFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: datasetFilters }), [geometryfilter, datasetFilters]);

  const { data: geometryFilterResults, isLoading: isLoadingPartialFilter } = useFilteredDatasets(partialFilterPayload);
  const { data: fullFilterResults, isLoading: isLoadingFullFilter } = useFilteredDatasets(fullFilterPayload);

  const [selectedSoilProperties, setSelectedSoilProperties] = useState<string[]>([]);

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
      return !dataset.dataType || !datasetFrontendFilters.type.length || datasetFrontendFilters.type.includes(dataset.dataType);
    });
  }, [allDatasets, datasetFrontendFilters]);

  const isLoading = useMemo(() => {
    return isLoadingPartialFilter || isLoadingFullFilter || isLoadingSoilProperties;
  }, [isLoadingFullFilter, isLoadingPartialFilter, isLoadingSoilProperties]);

  const isNoFilteredData = useMemo(() => {
    return fullFilterResults?.length === 0;
  }, [fullFilterResults]);

  const isNoData = useMemo(() => {
    return geometryFilterResults?.length === 0;
  }, [geometryFilterResults]);

  const timeFilterRange = useMemo((): TimeFilterRange => {
    if (!allDatasets.length) return { min: 0, max: 0 };

    let min: number = Infinity;
    let max: number = -Infinity;

    for (const dataset of allDatasets) {
      if (dataset.properties.dateStart) {
        min = Math.min(min, dataset.properties.dateStart);
      }
      if (dataset.properties.dateEnd) {
        max = Math.max(max, dataset.properties.dateEnd);
      }
    }

    return {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    };
  }, [allDatasets]);

  const typeFilterOptions = useMemo((): string[] => {
    if (!allDatasets.length) return [];
    const types: string[] = [];

    for (const dataset of allDatasets) {
      if (dataset.dataType && !types.includes(dataset.dataType)) {
        types.push(dataset.dataType);
      }
    }

    return types;
  }, [allDatasets]);

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(fullFilterResults);
  }, [fullFilterResults]);

  const filteredSoilProperties = useMemo<SoilProperty[]>(() => {
    const properties = new Set<string>();
    geometryFilterResults?.forEach(dataset => dataset.soil_properties?.forEach(prop => properties.add(prop)));
    return allSoilProperties?.filter(prop => properties.has(prop.slug)) ?? [];
  }, [allSoilProperties, geometryFilterResults]);

  return (
    <AvailabilityContext.Provider
      value={{
        allSoilProperties: allSoilProperties || [],
        filteredSoilProperties,
        isLoadingSoilProperties,
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
        timeFilterRange,
        typeFilterOptions,
        preview,
        selectDataset,
        setSearchValue,
        setFrontendFilters,
        selectAllDatasets,
        setDatasetFilters,
        setPreview,
        setGeometryFilter,
        selectedSoilProperties,
        setSelectedSoilProperties,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
