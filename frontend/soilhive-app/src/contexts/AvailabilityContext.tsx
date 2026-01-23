import { useFilteredDatasets } from 'hooks/useFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo, useEffect } from 'react';
import type { AvailabilityDataset, DatasetSummary } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { SoilProperty, FilterCriteria } from 'types/backend';
import { computeDatasetSummary } from '../domain';
import type { MultiPolygon, Polygon } from 'geojson';
import { useSoilProperties } from '../hooks/useSoilProperties';

type DatasetFilters = {
  type: string[];
  ownership: string;
};

type AvailabilityContextType = {
  allSoilProperties: SoilProperty[];
  filteredSoilProperties: SoilProperty[];
  isLoadingSoilProperties: boolean;
  datasets: AvailabilityDataset[];
  selectedDatasets: string[];
  isAllSelected: boolean;
  searchValue: string;
  selectedFilters: DatasetFilters;
  datasetsSummary: DatasetSummary;
  preview: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFilters: (value: string | string[], name: string) => void;
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
  const [selectedFilters, setSelectedFilters] = useState<DatasetFilters>({
    type: [],
    ownership: '',
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);
  const [preview, setPreview] = useState<boolean>(false);
  const [geometryfilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([]);
  const [datasetFilters, setDatasetFilters] = useState<FilterCriteria>({});
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const partialFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: {} }), [geometryfilter]);
  const fullFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: datasetFilters }), [geometryfilter, datasetFilters]);

  const { data: geometryFilterResults } = useFilteredDatasets(partialFilterPayload);
  const { data: fullFilterResults } = useFilteredDatasets(fullFilterPayload);

  const [selectedSoilProperties, setSelectedSoilProperties] = useState<string[]>([]);

  useEffect(() => {
    // TODO: this resets user-selected filters when geometry changes.
    // Replace this with merging logic.
    setDatasetFilters({});
  }, [geometryfilter]);

  const selectDataset = useCallback(
    (id: string) => {
      const newValue = selectedDatasets.includes(id) ? selectedDatasets.filter(selectedId => selectedId !== id) : [...selectedDatasets, id];

      setSelectedDatasets(newValue);
      setIsAllSelected(false);
    },
    [selectedDatasets],
  );

  const setFilters = useCallback(
    (value: string | string[], name?: string) => {
      if (!name) return;

      setSelectedFilters({
        ...selectedFilters,
        [name]: value,
      });
    },
    [selectedFilters],
  );

  const selectAllDatasets = useCallback(
    (select: boolean) => {
      setSelectedDatasets(select && fullFilterResults ? fullFilterResults?.map(result => result.id) : []);
      setIsAllSelected(select);
    },
    [fullFilterResults],
  );

  const datasets = useMemo(() => {
    if (!fullFilterResults) return [];
    return fullFilterResults.map(mapFilteredDatasetToAvailabilityDataset);
  }, [fullFilterResults]);

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
        searchValue,
        selectedFilters,
        datasetsSummary,
        preview,
        selectDataset,
        setSearchValue,
        setFilters,
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
