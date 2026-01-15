import { useFilteredDatasets } from 'hooks/useFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo, useEffect } from 'react';
import type { AvailabilityDataset, DatasetSummary } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { FilterableDatasetMetadata, SoilProperty, FilteredDataset } from 'types/backend';
import { computeDatasetSummary } from '../domain';
import type { MultiPolygon, Polygon } from 'geojson';
import { useSoilProperties } from '../hooks/useSoilProperties';

type DatasetFilters = {
  type: string[];
  ownership: string;
};

type DatasetsSummary = {
  count: number;
  dataPoints: number;
  layers: number;
  depth: string;
  date: string;
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
  datasetsSummary: DatasetsSummary;
  preview: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFilters: (value: string | string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterableDatasetMetadata>>;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [datasetFilters, setDatasetFilters] = useState<FilterableDatasetMetadata>({});
  const { data: allSoilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const partialFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: {} }), [geometryfilter]);
  const fullFilterPayload = useMemo(() => ({ geometries: geometryfilter, parameters: datasetFilters }), [geometryfilter, datasetFilters]);

  const { filteredResults: geometryFilterResults } = useFilteredDatasets(partialFilterPayload);
  const { filteredResults: fullFilterResults } = useFilteredDatasets(fullFilterPayload);

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
      setSelectedDatasets(
        select && fullFilterResults?.results
          ? fullFilterResults?.results?.flatMap(result => result.datasets.map(dataset => dataset.id))
          : [],
      );
      setIsAllSelected(select);
    },
    [fullFilterResults],
  );

  const datasets = useMemo(() => {
    if (!fullFilterResults || !fullFilterResults.results) return [];
    return fullFilterResults.results.flatMap(res => res.datasets.map(mapFilteredDatasetToAvailabilityDataset));
  }, [fullFilterResults]);

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(fullFilterResults);
  }, [fullFilterResults]);

  const filteredSoilProperties = useMemo<SoilProperty[]>(() => {
    const properties = new Set<string>();
    geometryFilterResults?.results.forEach(result =>
      result.datasets.forEach((dataset: FilteredDataset) => {
        dataset.soil_properties?.forEach(prop => properties.add(prop));
      }),
    );
    return allSoilProperties?.filter(prop => properties.has(prop.slug)) ?? [];
  }, [allSoilProperties, geometryFilterResults?.results]);

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
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
